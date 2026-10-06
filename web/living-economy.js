/* Town life extends the existing Play, Mind, World and Bonds screens. */
"use strict";
const money = (n) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
    (Number(n) || 0) / 100,
  );
const exLabels = {
  cash_shortfall: "Absehbare Geldknappheit",
  food_shortage: "Zu wenig Vorrat",
  health_pressure: "Gesundheitliche Belastung",
  experienced_crime: "Erlebter Sicherheitsvorfall",
};
function exMindHtml(r) {
  return `<div class="ex-grid"><section class="ex-card">${livingWellbeingHtml(r.mind || {})}</section><section class="ex-card"><h3>Was ich brauche und mir wünsche</h3><p>${esc(r.mind?.thought || "")}</p><small>${esc(r.mind?.mood || "")} · ${esc(r.mind?.current_desire || "")}</small><details><summary>Bedürfnisse · höher heißt dringender</summary>${livingNeedsHtml(r.mind || {})}</details><h4>Eigene Ziele</h4>${(r.mind?.goals || []).map((g) => exMeter(g.title_de || g.title || g.kind, g.progress || 0)).join("")}</section></div>`;
}
let expandedTab = "overview",
  expandedSim = null;
function exButton(kind, id, label, disabled = false) {
  return `<button class="btn btn-soft small" data-econ-kind="${esc(kind)}" data-econ-id="${esc(id || "")}" ${disabled ? "disabled" : ""}>${esc(label)}</button>`;
}
function exMeter(name, value, max = 1) {
  return `<div class="ex-meter"><span>${esc(name)}</span><progress max="${max}" value="${value}"></progress><b>${Math.round((value / max) * 100)}</b></div>`;
}
function exSocialHtml(data) {
  return `<p class="ex-muted">Vermutungen aus eigenen Begegnungen. Eine hohe Wahrscheinlichkeit ist kein Wissen über den anderen.</p>${
    (data?.contacts || [])
      .map(
        (c) =>
          `<article class="ex-contact"><b>${esc(c.subjectName)}</b><small>${esc((c.knownRoles || []).join(" · "))}</small>${Object.values(
            c.topics || {},
          )
            .map(
              (topic) =>
                `<p>${esc(topic.thought)}</p><div class="ex-probs">${Object.entries(
                  topic.probabilities,
                )
                  .filter(([, n]) => n > 0.01)
                  .map(
                    ([k, n]) =>
                      `<span>${esc({ support: "Zuwendung", obligation: "Abstimmung", criticism: "Kritik", romance: "Romantisches Interesse", unknown: "Unbekannter Anlass" }[k])} ${Math.round(n * 100)}%</span>`,
                  )
                  .join(
                    "",
                  )}</div><details><summary>Worauf stützt sich die Vermutung?</summary>${topic.sourceRefs.map((s) => `<p>${esc(s.observed)} · ${esc(s.modality)} · Sicherheit ${Math.round(s.reliability * 100)}%</p>`).join("")}</details>`,
            )
            .join("")}</article>`,
      )
      .join("") ||
    "<p>Nach einer ersten Begegnung entstehen mehrere mögliche Deutungen. Es werden keine Kontakte erfunden.</p>"
  }${(data?.secondOrder || []).map((c) => `<div class="ex-note"><b>Was könnte mein Gegenüber von mir erwarten?</b><p>${esc(c.text)}</p><small>Vermutung · ${Math.round(c.confidence * 100)}% Sicherheit</small></div>`).join("")}`;
}
function exHouseholdHtml(r) {
  const h = r.household,
    f = h.forecast;
  return `<div class="ex-stats"><div><small>Eigene verfügbare Mittel</small><b>${money(r.cashCents)}</b></div><div><small>Gemeinsames Konto</small><b>${money(f.availableCents)}</b></div><div><small>Bestätigtes Monatseinkommen</small><b>${money(f.incomeCents)}</b></div><div><small>Monatliche Spielraum-Prognose</small><b class="${f.marginCents < 0 ? "ex-negative" : "ex-positive"}">${money(f.marginCents)}</b></div></div><h4>${esc(h.name)}</h4><p>${h.members.map((m) => `${esc(m.name)}${m.sharedIncome !== null ? " · vereinbartes Netto " + money(m.sharedIncome) : ""}`).join("<br>")}</p><div class="ex-budget"><div><span>Miete</span><b>${money(h.lease?.rentCents || 0)}</b></div><div><span>Nebenkosten</span><b>${money(h.budget.utilities)}</b></div><div><span>Geplantes Essen</span><b>${money(f.foodCents)}</b></div><div><span>Kredite & Mitgliedschaften</span><b>${money(Math.max(0, f.fixedCents - (h.lease?.rentCents || 0) - h.budget.utilities))}</b></div><div><span>Offene Verpflichtungen</span><b>${money(f.arrearsCents)}</b></div></div><div class="ex-projections">${[
    [7, f.days7Cents],
    [30, f.days30Cents],
    [90, f.days90Cents],
  ]
    .map(
      ([day, amount]) =>
        `<div><small>Nach ${day} Tagen</small><b class="${amount < 0 ? "ex-negative" : ""}">${money(amount)}</b></div>`,
    )
    .join(
      "",
    )}</div><p class="ex-muted">Vereinfachte monatliche Planung mit bestätigten Verträgen. Zukünftiges Einkommen ist noch kein Geld auf dem Konto. Private Ersparnisse anderer Haushaltsmitglieder werden hier nicht offengelegt.</p><div class="ex-probs"><span>Basisvorrat: ${h.food.basic} Portionen</span><span>Standard: ${h.food.standard}</span><span>Feinkost: ${h.food.premium}</span></div>${r.loans
    .filter((l) => l.borrowerId === r.sim.id && l.status === "active")
    .map(
      (l) =>
        `<div class="ex-line"><span>Kredit · Restschuld ${money(l.principalCents)}<small>${money(l.paymentCents)} monatliche Rate · ${Math.round(l.annualRate * 1000) / 10}% fiktiver Jahreszins</small></span></div>`,
    )
    .join(
      "",
    )}${r.sim.age >= 18 ? '<button class="btn btn-soft small" id="ex-loan-plan">Finanzierten Kredit prüfen</button> <button class="btn btn-soft small" id="ex-household-join">Gemeinsamen Haushalt prüfen</button>' : ""}${
    r.children
      ?.filter((c) => c.age >= 15)
      .map(
        (c) =>
          `<div class="ex-line"><span>${esc(c.name)} · sicherer Ferienjob<small>15–17 Jahre · höchstens vier Stunden pro Tag · nur Ferien</small></span><button class="btn btn-soft small" data-ex-guardian="${c.id}" data-enabled="${!c.holidayPermission}">${c.holidayPermission ? "Erlaubnis widerrufen" : "Erlaubnis prüfen"}</button></div>`,
      )
      .join("") || ""
  }${exLedgerHtml(r)}${r.invoices.map((i) => `<div class="ex-line"><span>${esc({ rent: "Miete", utilities: "Nebenkosten", loan_payment: "Kreditrate", membership: "Mitgliedschaft", rental_income_tax: "Steuer auf Mietgewinn" }[i.kind] || i.kind)} · offen ${money(i.remainingCents)}</span>${exButton("pay_invoice", i.id, "Bezahlen", !i.remainingCents)}</div>`).join("")}`;
}
function exPersonHtml(r, { compact = false } = {}) {
  return `${exHouseholdHtml(r)}${compact ? "" : `${exMindHtml(r)}<div class="ex-grid"><section class="ex-card"><h3>Fähigkeiten & Attribute</h3>${r.skills.map((s) => exMeter(s.name, s.value)).join("")}<details><summary>Persönliche Attribute</summary>${r.attributes.map((s) => exMeter(s.name, s.value, 100)).join("")}${r.socialSkills.map((s) => exMeter(s.name, s.value, 100)).join("")}</details>${r.lastCheck ? `<div class="ex-note"><b>Letzter W100-Versuch</b><p>${esc(r.lastCheck.skill)} · Wurf ${r.lastCheck.roll} / Zielwert ${r.lastCheck.threshold} · ${esc({ excellent: "besonders gelungen", success: "gelungen", mixed: "Teilergebnis", setback: "Rückschlag" }[r.lastCheck.grade])}</p><small>Fertigkeit ${r.lastCheck.skill_rating}, Attribut ${r.lastCheck.attribute_rating}, Belastung ${r.lastCheck.pressure}. Ein Würfelerfolg ersetzt keine Zustimmung.</small></div>` : ""}</section><section class="ex-card"><h3>Was mich gerade beschäftigt</h3>${r.threats.map((t) => `<div class="ex-note"><b>${esc(exLabels[t.kind] || t.kind)}</b><p>${Math.round(t.probability * 100)}% eingeschätzte Wahrscheinlichkeit · ${esc(t.source || "eigene Erfahrung")}</p></div>`).join("") || "<p>Zurzeit keine konkrete neue Bedrohung in meinem eigenen Protokoll.</p>"}<h4>Angenommene Aufgaben</h4>${r.obligations.map((o) => `<div class="ex-line"><span>${esc(o.title)}<small>${Math.round(o.progress * 100)}% · ${esc({ accepted: "angenommen", needs_reschedule: "neu abstimmen", needs_resources: "Mittel fehlen" }[o.status] || o.status)}</small></span>${["needs_reschedule", "needs_resources"].includes(o.status) ? exButton("reschedule_task", o.id, "Neu abstimmen") : ""}${exButton("decline_task", o.id, "Absagen")}</div>`).join("") || "<p>Keine offene angenommene Aufgabe.</p>"}${(r.cases || []).length ? "<h4>Eigene dokumentierte Fälle</h4>" : ""}${(r.cases || []).map((c) => `<div class="ex-line"><span>${esc({ theft: "Diebstahl", burglary: "Einbruch", fraud: "Betrugsverdacht", robbery: "Raub", violence: "Gewaltvorfall", illegal_trade: "Handelsverdacht", exploitation: "Ausbeutung" }[c.kind] || c.kind)}<small>${esc({ unreported: "Noch nicht gemeldet", reported: "Aussage aufgenommen", investigating: "Wird geprüft", resolved: "Belegtes fiktives Verfahren abgeschlossen", closed_inconclusive: "Ohne ausreichenden Schuldbeleg abgeschlossen" }[c.status] || c.status)} · tatsächlicher Verlust ${money(c.lossCents)}</small></span>${c.ownRole === "victim" && !c.reported ? exButton("report_case", c.id, "Vorfall melden") : ""}</div>`).join("")}<h4>Ansehen</h4>${exMeter("Hilfsbereitschaft", r.reputation.helpfulness)}${exMeter("Verlässlichkeit", r.reputation.reliability)}${exMeter("Öffentliche Anerkennung", r.reputation.recognition)}${exMeter("Sichtbarer Besitz", r.reputation.visibleStatus)}<small>${esc(r.reputation.note)}</small><details><summary>Bekannte Quellen</summary>${r.reputation.sources.map((s) => "<p>" + esc(s.statement) + (s.verified ? " · belegt" : " · unbestätigt") + "</p>").join("") || "<p>Noch keine neuen belegten Aussagen.</p>"}</details>${r.health ? "<h4>Unterstützung</h4><p>Beratung ist unabhängig von Luxus und Besitz erreichbar.</p>" + exButton("support", null, "Beratung vereinbaren") + `<details><summary>Optionale private Erwachsenenrolle</summary><p>Standardmäßig aus. Keine Einzelheiten werden erzählt; nur ein tatsächlicher privater Kontakt zweier unabhängig zustimmender Erwachsener kann abgerechnet werden. Geldmangel und Rollenwahl ersetzen keine konkrete Zustimmung.</p><button class="btn btn-soft small" id="ex-adult-role">Eigene Rollenwahl öffnen</button></details>` : ""}</section></div>`}`;
}
function exJobsHtml(data) {
  return `<div class="ex-note"><b>Arbeit, die zu mir passt</b><p>Gewünschtes Mindestnetto: ${money(data.person.expectations.minimumNetCents)} · maximaler Arbeitsweg ${Math.round(data.person.expectations.maxCommuteSeconds / 60)} Minuten. Qualifikation, tatsächliches Können und belegte Erfahrungen dieser Firma zählen.</p><button class="btn btn-soft small" id="ex-expectations">Eigene Erwartungen anpassen</button></div><div class="ex-grid">${
    data.jobs
      .filter((j) => j.slots > 0)
      .map(
        (j) =>
          `<article class="ex-card"><small>${esc(j.firmName)}</small><h3>${esc(j.title)}</h3><div class="ex-probs"><span>${money(j.grossMonthlyCents)} brutto</span><span>ca. ${money(j.estimatedNetCents)} netto</span><span>${j.slots} offene Stellen</span></div><p>${j.hoursPerDay} Stunden am Arbeitstag${j.holiday ? " · sicherer Ferienjob mit Zustimmung der Bezugsperson" : ""}</p>${exMeter("Eigenes Können / Anforderung " + Math.round(j.minimumSkill * 100), j.assessment.skill)}<p class="${j.assessment.eligible ? "ex-positive" : "ex-muted"}">${j.assessment.eligible ? "Passt zu den eigenen Erwartungen und Nachweisen." : esc(j.assessment.reasons.join(" · "))}</p>${exButton("apply_job", j.id, "Bewerben", !j.assessment.eligible)} ${exButton("leisure", "course", "Fertigkeit ausbauen")}</article>`,
      )
      .join("") ||
    "<p>Zurzeit keine freien Stellen. Bestehende Verträge und erreichbare Fortbildung bleiben erhalten.</p>"
  }</div>`;
}
async function livingEconomyScreen() {
  const world = (await loadWorld(true)).world;
  if (world.simulation_mode !== "living") return nav(`#/stage?w=${S.world}`);
  const params = new URLSearchParams(location.hash.split("?")[1] || "");
  expandedSim = params.get("s") || expandedSim;
  app.innerHTML =
    chrome("city", {
      worldTitle: world.title,
      sub: "Ein Alltag mit Möglichkeiten, Beziehungen und echten Entscheidungen",
    }) + '<div class="ex-page"><p>Die Stadt wird geladen…</p></div>';
  bindChrome();
  let data = await api(
    lwPath() +
      "/economy" +
      (expandedSim ? "?simId=" + encodeURIComponent(expandedSim) : ""),
  );
  expandedSim = data.selectedSimId;
  const render = () => {
    const r = data.person;
    $(".ex-page").innerHTML =
      `<div class="ex-heading"><div><small>${esc(world.title.toUpperCase())} · STADTLEBEN</small><h1>Was heute möglich ist</h1><p>${new Date(r.date || data.clock * 1000 + Date.UTC(2026, 8, 21)).toLocaleString("de-DE")} · ${data.summary.population} Einwohner</p></div><div class="ex-person">${r.sim.asset_id ? `<img class="ex-portrait" alt="" src="/api/living/library/${r.sim.asset_id}?variant=sprite">` : ""}<button class="btn btn-soft" id="ex-sim-picker">${esc(r.sim.name)} · ${r.sim.age} ▾</button><button class="btn btn-teal small" id="ex-play">▶ Szene</button><button class="btn btn-soft small" id="ex-profile">Profil</button></div></div><nav class="ex-tabs" aria-label="Stadtleben">${[
        ["overview", "Mein Alltag"],
        ["jobs", "Stellenbörse"],
        ["housing", "Wohnungsbörse"],
        ["leisure", "Freizeit & Besitz"],
        ["views", "Soziale Sicht"],
        ["news", "Rundblick & Rathaus"],
      ]
        .map(
          ([id, name]) =>
            `<button role="tab" aria-selected="${expandedTab === id}" class="${expandedTab === id ? "active" : ""}" data-ex-tab="${id}">${name}</button>`,
        )
        .join("")}</nav><div id="ex-content"></div>`;
    const out = $("#ex-content");
    if (expandedTab === "overview") out.innerHTML = exPersonHtml(r);
    else if (expandedTab === "jobs") out.innerHTML = exJobsHtml(data);
    else if (expandedTab === "housing")
      out.innerHTML = `<div class="ex-note"><h3>Ein passendes Zuhause</h3><p>Freie Wohnungen für ${r.household.members.length} Personen, passend zu bestätigtem Einkommen und gewähltem Budget. Ein Vertrag führt zu tatsächlichen Wegen und einem dokumentierten Umzug.</p></div><div class="ex-grid">${data.housing.map((h) => `<article class="ex-card"><h3>${esc(h.name)}</h3><p>${money(h.rentCents)} Miete · ${money(h.depositCents)} gebundene Kaution</p><p>Platz für ${h.capacity} Personen</p>${exMeter("Zustand", h.condition)}${exButton("move", h.id, "Mietvertrag annehmen", r.sim.age < 18)} <button class="btn btn-soft small" data-ex-property="${h.id}" data-price="${h.valueCents}" ${r.sim.age < 18 ? "disabled" : ""}>Kauf / Finanzierung prüfen</button> ${exButton("move_help", h.id, "Mit Wohnhilfe prüfen", r.sim.age < 18)}</article>`).join("") || "<p>Aktuell kein passendes freies Angebot. Wohnberatung und geschützte Unterkunft bleiben als Hilfe verfügbar.</p>"}</div><h3>Eigentum · getrennt vom Wohnort</h3>${r.propertyAssets.map((p) => `<div class="ex-card"><b>${esc(p.name)}</b><p>Geschätzter Objektwert ${money(p.valueCents)} · ${p.residents.length ? "bewohnt" : "frei"} · Mietangebot ${money(p.rentCents)}</p></div>`).join("") || "<p>Kein eigenes Immobilienobjekt.</p>"}`;
    else if (expandedTab === "views")
      out.innerHTML =
        '<section class="ex-card"><h3>Meine Vermutungen über andere</h3>' +
        exSocialHtml(r.socialViews) +
        "</section>";
    else if (expandedTab === "leisure")
      out.innerHTML = `<div class="ex-grid">${data.activities.map((a) => `<article class="ex-card"><h3>${esc(a.name)}</h3><p>${esc(a.effects)}</p><small>${esc(a.access)} · ${esc(a.accounting)}</small><p>${a.minCents === 0 ? "Kostenlose Variante" : money(a.minCents) + " – " + money(a.maxCents)}</p>${exButton(/member|pass|club/.test(a.id) ? "membership" : "leisure", a.id, "Planen", !a.offer.ok)}${!a.offer.ok ? '<p class="ex-muted">' + esc(a.offer.reason) + "</p>" : ""}</article>`).join("")}</div><h3>Mein besonderer Besitz</h3><div class="ex-grid">${r.items.map((i) => `<article class="ex-card"><h4>${esc(i.name)}</h4>${exMeter("Zustand", i.condition)}<p>${i.loanedTo ? "verliehen" : "zugänglich"} · ${i.publiclyDisplayed ? "öffentlich gezeigt" : "privat"}</p>${i.ownerId === r.sim.id ? `<button class="btn btn-soft small" data-ex-display="${i.id}" data-enabled="${!i.publiclyDisplayed}">${i.publiclyDisplayed ? "Privat halten" : "Öffentlich zeigen"}</button>${!i.loanedTo ? `<button class="btn btn-soft small" data-ex-transfer="${i.id}">Schenken / verleihen</button>` : ""}` : exButton("return_item", i.id, "Zurückgeben")}</article>`).join("") || "<p>Keine besonderen Gegenstände. Bibliothek, Park und Nachbarschaft bleiben auch ohne Anschaffungen verfügbar.</p>"}</div><details><summary>Anschaffungen ansehen</summary><div class="ex-grid">${data.items
        .filter((i) => i.maxCents > 0)
        .map(
          (i) =>
            `<article class="ex-card"><h4>${esc(i.name)}</h4><p>${esc(i.use)}</p><p>${money(Math.round((i.minCents + i.maxCents) / 2))}</p>${exButton("buy_item", i.id, "Kauf prüfen")}</article>`,
        )
        .join("")}</div></details>${r.subscriptions
        .filter((s) => s.status === "active")
        .map(
          (s) =>
            `<div class="ex-line"><span>${esc(s.activityId)} · ${money(s.monthlyCents)} monatlich</span>${exButton("cancel_membership", s.id, "Kündigen")}</div>`,
        )
        .join("")}`;
    else
      out.innerHTML = `<div class="ex-grid"><section class="ex-card"><small>LINDENSTÄDTER RUNDBLICK</small><h2>Was die Stadt bewegt</h2>${data.news.map((n) => `<article class="ex-news"><small>${new Date(Date.UTC(2026, 8, 21) + n.at * 1000).toLocaleDateString("de-DE")} · belegtes Stadtgeschehen</small><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p>${n.editorial ? "<p><i>" + esc(n.editorial) + "</i> · Kommentar des Storytellers" : `<button class="btn btn-soft small" data-ex-editorial="${n.id}">Mit eigenem Sprachmodell kommentieren</button>`}</article>`).join("") || "<p>Die erste Ausgabe entsteht mit dem nächsten Zeitschritt.</p>"}</section><section class="ex-card"><h3>Rathaus & gemeinsame Mittel</h3>${data.institutions.map((i) => `<div class="ex-line"><span>${esc(i.name)}<small>${i.monthlyRegionalGrantCents ? "Ausgewiesene monatliche Regionalmittel " + money(i.monthlyRegionalGrantCents) : "Getrennter, tatsächlich finanzierter Fonds"}${i.reserveCents ? " · geschützte Reserve " + money(i.reserveCents) : ""}</small></span><b>${money(i.cashCents)}</b></div>`).join("")}<p class="ex-muted">Fiktive deutsche Spielökonomie: Steuern, Sozialversicherung, Gesundheitsversorgung und Stadtkasse bleiben getrennt. Regionale Mittel und Handel mit anderen Städten werden ausdrücklich gebucht.</p>${exButton("festival", null, "Offenes Fest aus dem Stadtbudget prüfen", r.sim.age < 18)} ${exButton("donate", null, "Freiwillig 25 € beitragen", r.sim.age < 18)}<details><summary>Spielregeln zu Geld und Schutz</summary><p>Wohnmiete wird ohne Umsatzsteuer gebucht; positive Mieterträge werden versteuert. Lohn berücksichtigt fiktive Einkommensteuer sowie Arbeitnehmer- und Arbeitgeberbeiträge. Geldmangel erzwingt weder Beziehungszustimmung noch eine Straftat.</p><p>Erwachsenenmodule zu Kriminalität und riskantem Konsum sind abstrakt. Minderjährige erhalten keine sexuellen Handlungen und keine Erwachsenenrollen. Romantische Zuneigung ist unter 14 null; 14–17 höchstens 0,35, nur harmlose Jugendromanzen mit höchstens einem Jahr Altersabstand.</p></details></section></div>`;
    $$("[data-ex-editorial]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            await api(
              lwPath() + "/news/" + b.dataset.exEditorial + "/commentary",
              { method: "POST", body: { expectedVersion: data.version } },
            );
            data = await api(lwPath() + "/economy?simId=" + r.sim.id);
            render();
          } catch (e) {
            fail(e);
            b.disabled = false;
          }
        }),
    );
    $$("[data-ex-tab]").forEach(
      (b) =>
        (b.onclick = () => {
          expandedTab = b.dataset.exTab;
          render();
        }),
    );
    $("#ex-sim-picker").onclick = () =>
      livingSimPicker((p) => {
        expandedSim = p.id;
        nav(`#/city?w=${S.world}&s=${p.id}`);
      });
    $("#ex-play").onclick = () =>
      livingJump({ type: "character", id: r.sim.id });
    $("#ex-profile").onclick = () => livingProfileDrawer(r.sim.id);
    const act = async (kind, id, extra = {}) => {
      try {
        await exDecision(r, kind, id, extra);
        data = await api(lwPath() + "/economy?simId=" + r.sim.id);
        render();
      } catch (e) {
        fail(e);
      }
    };
    $$("[data-econ-kind]").forEach(
      (b) => (b.onclick = () => act(b.dataset.econKind, b.dataset.econId)),
    );
    $$("[data-ex-display]").forEach(
      (b) =>
        (b.onclick = () =>
          act("display_item", b.dataset.exDisplay, {
            enabled: b.dataset.enabled === "true",
          })),
    );
    $$("[data-ex-transfer]").forEach(
      (b) =>
        (b.onclick = () => {
          const m = lwModal(
            "Gegenstand gemeinsam vereinbaren",
            "Nur anwesende bekannte Sims können einen Gegenstand tatsächlich übernehmen.",
            `<label>Empfänger<select id="ex-item-target">${r.localContacts.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label><label>Vereinbarung<select id="ex-item-kind"><option value="lend_item">Vorübergehend verleihen</option><option value="gift_item">Dauerhaft schenken</option></select></label><label><input type="checkbox" id="ex-item-consent"> Beide Sims stimmen dieser konkreten Übergabe zu.</label><button class="btn btn-primary" id="ex-item-submit" ${r.localContacts.length ? "" : "disabled"}>Vereinbarung prüfen</button>`,
          );
          $("#ex-item-submit", m).onclick = () => {
            const targetId = $("#ex-item-target", m).value,
              kind = $("#ex-item-kind", m).value,
              consent = $("#ex-item-consent", m).checked;
            m.remove();
            act(kind, b.dataset.exTransfer, {
              targetId,
              consent,
              targetConsent: consent,
            });
          };
        }),
    );
    exBindPreferences($(".ex-page"), r, act);
    const loan = $("#ex-loan-plan");
    if (loan)
      loan.onclick = () => exLoanDialog((values) => act("loan", null, values));
    const join = $("#ex-household-join");
    if (join) join.onclick = () => exHouseholdDialog(r, act);
    $$("[data-ex-property]").forEach(
      (b) =>
        (b.onclick = () => {
          const price = Number(b.dataset.price),
            m = lwModal(
              "Eigentum und Finanzierung",
              "Ein Kauf ändert den Wohnort nicht automatisch. Erwartete Mieten sind keine zugesagte Einnahme.",
              `<p>Kaufpreis ${money(price)} · bei Finanzierung mindestens ${money(Math.ceil(price * 0.2))} Eigenmittel, zusätzlich 2.500 € geschützte Reserve.</p><label>Eigenmittel (€)<input id="ex-down" type="number" min="0" value="${Math.ceil(price * 0.2) / 100}"></label><label>Laufzeit (Monate)<input id="ex-term" type="number" min="12" max="360" value="240"></label><label><input type="checkbox" id="ex-property-consent"> Ausdrückliche eigene Zustimmung</label><button class="btn btn-primary" id="ex-property-submit">Finanzierung prüfen</button><button class="btn btn-soft" id="ex-property-cash">Aus eigenen Mitteln kaufen</button>`,
            );
          $("#ex-property-submit", m).onclick = () => {
            const values = {
              amountCents: Math.round(Number($("#ex-down", m).value) * 100),
              months: Number($("#ex-term", m).value),
              consent: $("#ex-property-consent", m).checked,
            };
            m.remove();
            act("mortgage", b.dataset.exProperty, values);
          };
          $("#ex-property-cash", m).onclick = () => {
            const values = { consent: $("#ex-property-consent", m).checked };
            m.remove();
            act("buy_property", b.dataset.exProperty, values);
          };
        }),
    );
    const expectations = $("#ex-expectations");
    if (expectations)
      expectations.onclick = () => {
        const m = lwModal(
          "Meine Erwartungen",
          "Passende Stellen statt beliebiger automatischer Arbeit",
          `<label>Mindestnetto (€)<input id="ex-net" type="number" min="0" max="30000" value="${r.expectations.minimumNetCents / 100}"></label><label>Maximaler Arbeitsweg (Minuten)<input id="ex-commute" type="number" min="1" max="240" value="${r.expectations.maxCommuteSeconds / 60}"></label><button class="btn btn-primary" id="ex-save-expectations">Übernehmen</button>`,
        );
        $("#ex-save-expectations", m).onclick = () => {
          const values = {
            minimumNetCents: Math.round(Number($("#ex-net", m).value) * 100),
            maxCommuteSeconds: Math.round(
              Number($("#ex-commute", m).value) * 60,
            ),
          };
          m.remove();
          act("expectations", null, values);
        };
      };
  };
  render();
}
async function livingResourceModal(id) {
  const r = await api(lwPath() + `/sims/${id}/resources`),
    m = lwModal(
      r.sim.name + " · Haushalt & Fähigkeiten",
      "Eigene Mittel, vereinbarte Haushaltsplanung und tatsächliche Erfahrungen",
      `<div class="ex-profile">${exPersonHtml(r)}<button class="btn btn-teal" id="ex-open-city">Stellen, Wohnungen und soziale Sicht öffnen</button></div>`,
      1000,
    );
  const act = async (kind, entityId, extra = {}) => {
    try {
      await exDecision(r, kind, entityId, extra);
      m.remove();
      await livingResourceModal(id);
    } catch (e) {
      fail(e);
    }
  };
  $$("[data-econ-kind]", m).forEach(
    (b) => (b.onclick = () => act(b.dataset.econKind, b.dataset.econId)),
  );
  exBindPreferences(m, r, act);
  const loan = $("#ex-loan-plan", m);
  if (loan)
    loan.onclick = () => exLoanDialog((values) => act("loan", null, values));
  const join = $("#ex-household-join", m);
  if (join) join.onclick = () => exHouseholdDialog(r, act);
  $("#ex-open-city", m).onclick = () => {
    m.remove();
    $$(".lw-profile").forEach((el) => el.remove());
    expandedSim = id;
    nav(`#/city?w=${S.world}&s=${id}`);
  };
}

async function exDecision(r, kind, id, extra = {}) {
  const result = await api(lwPath() + "/economy/actions", {
    method: "POST",
    body: {
      kind: kind === "move_help" ? "move" : kind,
      id,
      simId: r.sim.id,
      expectedVersion: r.version,
      ...(kind === "move_help" ? { support: true } : {}),
      ...(kind === "donate" ? { amountCents: 2500, publicly: true } : {}),
      ...extra,
    },
  });
  toast(
    result.ok
      ? "Entscheidung im eigenen Protokoll gespeichert."
      : result.reason ||
          result.reasons?.join("; ") ||
          "Dieser Schritt ist noch nicht möglich.",
    result.ok ? "" : "err",
  );
  S.worldData = null;
  return result;
}
function exLoanDialog(submit) {
  const m = lwModal(
    "Kredit prüfen",
    "Eine Auszahlung ist eine neue Schuld; die eigene Zustimmung ersetzt die Prüfung des finanzierten Angebots nicht.",
    `<label>Betrag (€)<input type="number" id="ex-loan-amount" min="100" max="50000" value="1000"></label><label>Laufzeit (Monate)<input type="number" id="ex-loan-months" min="1" max="120" value="12"></label><label><input type="checkbox" id="ex-loan-consent"> Dieser Sim nimmt die Verpflichtung ausdrücklich an.</label><button class="btn btn-primary" id="ex-loan-submit">Angebot prüfen</button>`,
  );
  $("#ex-loan-submit", m).onclick = () => {
    const values = {
      amountCents: Math.round(Number($("#ex-loan-amount", m).value) * 100),
      months: Number($("#ex-loan-months", m).value),
      consent: $("#ex-loan-consent", m).checked,
    };
    m.remove();
    submit(values);
  };
}
function exLedgerHtml(r) {
  const months = Object.entries(r.flows || {}).sort(([a], [b]) =>
    b.localeCompare(a),
  );
  return `<details><summary>Tatsächliche Einnahmen, Ausgaben und Buchungen</summary>${months
    .slice(0, 3)
    .map(
      ([month, f]) =>
        `<p>${esc(month)} · eingegangen ${money(f.incomeCents)} · ausgegeben ${money(f.spendingCents)}</p>`,
    )
    .join(
      "",
    )}${(r.ledger || []).map((t) => `<div class="ex-line"><span>${esc({ groceries: "Lebensmittel", payroll: "Nettolohn", rent: "Miete", internal_household_transfer: "Gemeinsamer Haushalt", loan_principal: "Kreditauszahlung", membership: "Mitgliedschaft", activity_fee: "Freizeit", funded_support: "Bestätigte Unterstützung" }[t.kind] || t.kind)}<small>${new Date(Date.UTC(2026, 8, 21) + t.at * 1000).toLocaleDateString("de-DE")} · eigenes oder gemeinsames Konto</small></span><b>${money(t.amount_cents)}</b></div>`).join("") || "<p>Noch keine neuen Buchungen.</p>"}</details>`;
}
function exHouseholdDialog(r, act) {
  livingSimPicker(async (target) => {
    try {
      const other = await api(lwPath() + `/sims/${target.id}/resources`),
        adults = [...r.household.members, ...other.household.members].filter(
          (m) => m.age >= 18,
        ),
        ids = [...new Set(adults.map((m) => m.id))],
        m = lwModal(
          "Gemeinsamer Haushalt",
          "Alle Bezugspersonen müssen zustimmen. Ein Zusammenschluss ist keine romantische Beziehung.",
          `<p>${adults.map((a) => esc(a.name)).join(", ")} müssen der Wohn- und Kostenabsprache zustimmen. Private Konten bleiben privat; Kinder ziehen mit ihren Bezugspersonen um. Das Ziel ist ${esc(other.household.name)}.</p><label><input type="checkbox" id="ex-join-consent"> Alle genannten Erwachsenen stimmen dieser konkreten Absprache zu.</label><button class="btn btn-primary" id="ex-join-submit">Wohnraum und Zustimmung prüfen</button>`,
        );
      $("#ex-join-submit", m).onclick = () => {
        const consent = $("#ex-join-consent", m).checked;
        m.remove();
        act("join_households", null, {
          targetId: target.id,
          consentingAdultIds: consent ? ids : [],
        });
      };
    } catch (e) {
      fail(e);
    }
  });
}

function exBindPreferences(scope, r, act) {
  $$("[data-ex-guardian]", scope).forEach(
    (b) =>
      (b.onclick = () =>
        act("guardian_permission", null, {
          targetId: b.dataset.exGuardian,
          enabled: b.dataset.enabled === "true",
        })),
  );
  const role = $("#ex-adult-role", scope);
  if (role)
    role.onclick = () => {
      const m = lwModal(
        "Eigene freiwillige Erwachsenenrolle",
        "Standardmäßig deaktiviert, nur 18+, privat und nicht explizit.",
        `<label>Eigene Wahl<select id="ex-service-role"><option value="off">Deaktiviert</option><option value="worker">Selbstbestimmte private Dienstleistungsrolle</option><option value="client">Optionale erwachsene Kundenrolle</option></select></label><label><input type="checkbox" id="ex-service-consent"> Dieser Sim nimmt diese eigene Rollenwahl freiwillig an.</label><button class="btn btn-primary" id="ex-service-save">Eigene Wahl speichern</button>`,
      );
      $("#ex-service-role", m).value = r.adultService?.workerOptIn
        ? "worker"
        : r.adultService?.clientOptIn
          ? "client"
          : "off";
      $("#ex-service-save", m).onclick = () => {
        const choice = $("#ex-service-role", m).value,
          consent = $("#ex-service-consent", m).checked;
        m.remove();
        act("adult_service_preferences", null, {
          enabled: choice !== "off",
          role: choice,
          consent,
        });
      };
    };
}
