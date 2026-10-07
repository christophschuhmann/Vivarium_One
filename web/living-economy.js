/* Town life extends the existing Play, Mind, World and Bonds screens. */
"use strict";
let livingCurrency='EUR';
const money = (n) =>
  new Intl.NumberFormat(getLang()==="en"?"en-US":"de-DE", { style: "currency", currency: livingCurrency }).format(
    (Number(n) || 0) / 100,
  );
const exLabels = {
  cash_shortfall: "Expected cash shortfall",
  food_shortage: "Low supplies",
  health_pressure: "Health strain",
  experienced_crime: "Experienced safety incident",
};
function exMindHtml(r) {
  return `<div class="lw-vitals">${livingVitalsHtml({...r.mind,socialAttributes:r.dynamics?.socialAttributes,aptitudes:{attributes:Object.fromEntries(r.attributes.map(a=>[a.id,a.value]))}})}</div><div class="ex-grid"><section class="ex-card">${livingWellbeingHtml(r.mind || {})}</section><section class="ex-card"><h3>What I need and want</h3><p>${esc(r.mind?.thought || "")}</p><small>${esc(r.mind?.mood || "")} · ${esc(r.mind?.current_desire || "")}</small><h4>Personal goals</h4>${(r.mind?.goals || []).map((g) => exMeter(g.title_de || g.title || g.kind, g.progress || 0, 1, "goal")).join("")}</section></div>`;
}
let expandedTab = "overview",
  expandedSim = null;
function exButton(kind, id, label, disabled = false) {
  return `<button class="btn btn-soft small" data-econ-kind="${esc(kind)}" data-econ-id="${esc(id || "")}" ${disabled ? "disabled" : ""}>${esc(label)}</button> ${exInfo(/support|counsel|therapy/.test(kind)?"support_action":/apply|application/.test(kind)?"application_action":/plan|activity|book/.test(kind)?"plan_activity":kind)}`;
}
function exMeter(name, value, max = 1, concept = "skill") {
  return `<div class="ex-meter"><span>${exExplain(name, exConceptKey(name) || concept)}</span><progress max="${max}" value="${value}"></progress><b>${Math.round((value / max) * 100)}</b></div>`;
}
function exSocialTopicHtml(topic) {
  const v = topic.perspective;
  if (!v)
    return `<p>${esc(topic.thought || "This older note does not include a more detailed interpretation.")}</p>`;
  return `<div class="ex-social-context">${esc(v.contextLabel)}</div><div class="ex-social-pair"><section><h4>What I actually observed</h4><p>${esc(v.observation)}</p></section><section class="ex-interpretation"><h4>How I interpret it right now</h4><p>${esc(v.interpretation)}</p></section></div><div class="ex-social-wish"><b>What matters to me</b><p>${esc(v.myWish)}</p>${v.selfLens.length ? "<ul>" + v.selfLens.map((t) => "<li>" + esc(t) + "</li>").join("") + "</ul>" : "<small>My expectations reflect my personality and what I know about this relationship; they may change as we talk.</small>"}</div><details class="ex-alternatives"><summary>Other plausible explanations</summary>${
    v.alternatives
      .filter((a) => a.text !== v.interpretation)
      .map((a) => "<p>" + esc(a.text) + "</p>")
      .join("") ||
    "<p>The reason may still be unknown. I should not infer a fixed intention from a single encounter.</p>"
  }</details>${v.metabelief ? `<div class="ex-note"><b>What impression might I have made?</b><p>${esc(v.metabelief)}</p></div>` : ""}${v.audience ? '<p class="ex-audience">' + esc(v.audience) + "</p>" : ""}<div class="ex-next-step"><b>A possible next step</b><p>${esc(v.nextStep)}</p><small>A thought, not an action carried out automatically.</small></div><details><summary>What I do not know yet</summary><ul>${v.unknowns.map((t) => "<li>" + esc(t) + "</li>").join("")}</ul></details><details><summary>My sources and how I weigh possibilities</summary><p class="ex-muted">These percentages compare possible interpretations in my model. They measure neither the other person’s feelings nor their consent.</p><div class="ex-probs">${Object.entries(
    topic.probabilities || {},
  )
    .filter(([k, n]) => n > 0.01 && (k !== "romance" || v.romanceAllowed))
    .map(
      ([k, n]) =>
        `<span>${esc({ support: "Support", obligation: "Coordination", criticism: "Criticism", romance: "Voluntary closeness", unknown: "Unknown reason" }[k] || k)} ${Math.round(n * 100)}%</span>`,
    )
    .join("")}</div>${
    (topic.sourceRefs || [])
      .slice()
      .reverse()
      .map(
        (s) =>
          `<div class="ex-evidence"><b>${esc(s.description || "Earlier encounter")}</b><small>${esc({ direct: "Took part in the conversation", nearby_observation: "Observed nearby", telephone: "Heard over the phone" }[s.modality] || "Personal note")} · ${Number.isFinite(s.at) ? new Date(Date.UTC(2026, 8, 21) + s.at * 1000).toLocaleString(getLang()==="en"?"en-US":"de-DE") : "Time unknown"} · Observation weight ${Math.round((s.reliability || 0) * 100)}%</small></div>`,
      )
      .join("") || "<p>No encounter has been recorded as a source yet.</p>"
  }</details>`;
}
function exSocialHtml(data) {
  const contacts = data?.contacts || [];
  return `<div class="ex-social-intro"><p>I see the world from my own perspective. My observations are the starting point, but my interpretations may be mistaken.</p><p class="ex-muted">Here are notes on ${contacts.length} ${contacts.length === 1 ? "known contact" : "known contacts"}. New memories come from real encounters. Other Sims’ inner lives remain private to them.</p></div>${contacts.length ? '<label class="ex-social-search">Find a contact<input id="ex-social-search" type="search" placeholder="Name or known relationship…" autocomplete="off"></label><p id="ex-social-count" class="ex-muted" aria-live="polite">' + contacts.length + (contacts.length === 1 ? " contact" : " contacts") + "</p>" : ""}<div class="ex-social-list">${
    contacts
      .map((c) => {
        const topics = Object.values(c.topics || {}).sort(
          (a, b) => b.updatedAt - a.updatedAt,
        );
        return `<article class="ex-contact" data-ex-contact="${esc((c.subjectName + " " + (c.knownRoles || []).join(" ")).toLocaleLowerCase(getLang()==="en"?"en-US":"de-DE"))}"><header class="ex-contact-heading"><div><h3>${esc(c.subjectName)}</h3><small>${esc((c.knownRoles || []).join(" · ") || "Known contact")}</small></div><div class="ex-contact-actions"><button class="btn btn-soft small" data-ex-social-profile="${esc(c.subjectId)}">Profile</button><button class="btn btn-soft small" data-ex-social-bonds="${esc(c.subjectId)}">Relationships</button><button class="btn btn-teal small" data-ex-social-play="${esc(c.subjectId)}">▶ Play scene</button></div></header>${topics[0] ? exSocialTopicHtml(topics[0]) : "<p>No more detailed personal note yet.</p>"}${topics.length > 1 ? '<details class="ex-older-topics"><summary>More encounter contexts (' + (topics.length - 1) + ")</summary>" + topics.slice(1).map(exSocialTopicHtml).join("") + "</details>" : ""}</article>`;
      })
      .join("") ||
    '<div class="ex-note"><b>My encounters have not left any new notes yet.</b><p>A conversation can lead to several possible interpretations, each with its own source. No experiences are invented.</p></div>'
  }</div><p id="ex-social-empty" class="ex-note" hidden>No saved contact matches this search. The Sim Explorer also shows Sims I have not met yet.</p>`;
}
function exBindSocial(root) {
  const input = $("#ex-social-search", root);
  if (input)
    input.oninput = () => {
      const query = input.value.trim().toLocaleLowerCase(getLang()==="en"?"en-US":"de-DE");
      let visible = 0;
      $$("[data-ex-contact]", root).forEach((card) => {
        card.hidden = !card.dataset.exContact.includes(query);
        if (!card.hidden) visible++;
      });
      $("#ex-social-count", root).textContent =
        `${visible} of ${$$("[data-ex-contact]", root).length} ${$$("[data-ex-contact]", root).length === 1 ? "contact" : "contacts"}`;
      $("#ex-social-empty", root).hidden = visible > 0;
    };
  $$("[data-ex-social-profile]", root).forEach(
    (b) => (b.onclick = () => livingProfileDrawer(b.dataset.exSocialProfile)),
  );
  $$("[data-ex-social-bonds]", root).forEach(
    (b) => (b.onclick = () => livingBondsJump(b.dataset.exSocialBonds)),
  );
  $$("[data-ex-social-play]", root).forEach(
    (b) =>
      (b.onclick = () =>
        livingJump({ type: "character", id: b.dataset.exSocialPlay })),
  );
}
function exHouseholdHtml(r) {
  const h = r.household,
    f = h.forecast;
  return `<div class="ex-stats"><div><small>My available funds</small><b>${money(r.cashCents)}</b></div><div><small>Shared account</small><b>${money(f.availableCents)}</b></div><div><small>Confirmed monthly income</small><b>${money(f.incomeCents)}</b></div><div><small>Projected monthly margin</small><b class="${f.marginCents < 0 ? "ex-negative" : "ex-positive"}">${money(f.marginCents)}</b></div></div><h4>${esc(h.name)}</h4><p>${h.members.map((m) => `${esc(m.name)}${m.sharedIncome !== null ? " · agreed net pay " + money(m.sharedIncome) : ""}`).join("<br>")}</p><div class="ex-budget"><div><span>Rent</span><b>${money(h.lease?.rentCents || 0)}</b></div><div><span>Utilities</span><b>${money(h.budget.utilities)}</b></div><div><span>Planned food</span><b>${money(f.foodCents)}</b></div><div><span>Loans & memberships</span><b>${money(Math.max(0, f.fixedCents - (h.lease?.rentCents || 0) - h.budget.utilities))}</b></div><div><span>Outstanding obligations</span><b>${money(f.arrearsCents)}</b></div></div><div class="ex-projections">${[
    [7, f.days7Cents],
    [30, f.days30Cents],
    [90, f.days90Cents],
  ]
    .map(
      ([day, amount]) =>
        `<div><small>In ${day} days</small><b class="${amount < 0 ? "ex-negative" : ""}">${money(amount)}</b></div>`,
    )
    .join(
      "",
    )}</div><p class="ex-muted">A simplified monthly plan based on confirmed agreements. Future income is not yet money in the account. Other household members’ private savings are not shown here.</p><div class="ex-probs"><span>Basic supplies: ${h.food.basic} portions</span><span>Standard: ${h.food.standard}</span><span>Premium food: ${h.food.premium}</span></div>${r.loans
    .filter((l) => l.borrowerId === r.sim.id && l.status === "active")
    .map(
      (l) =>
        `<div class="ex-line"><span>Loan · remaining balance ${money(l.principalCents)}<small>${money(l.paymentCents)} monthly payment · ${Math.round(l.annualRate * 1000) / 10}% fictional annual interest</small></span></div>`,
    )
    .join(
      "",
    )}${r.sim.age >= 18 ? '<button class="btn btn-soft small" id="ex-loan-plan">Review loan options</button> <button class="btn btn-soft small" id="ex-household-join">Review shared household</button>' : ""}${
    r.children
      ?.filter((c) => c.age >= 15)
      .map(
        (c) =>
          `<div class="ex-line"><span>${esc(c.name)} · safe holiday job<small>Ages 15–17 · no more than four hours per day · school holidays only</small></span><button class="btn btn-soft small" data-ex-guardian="${c.id}" data-enabled="${!c.holidayPermission}">${c.holidayPermission ? "Revoke permission" : "Review permission"}</button></div>`,
      )
      .join("") || ""
  }${exLedgerHtml(r)}${r.invoices.map((i) => `<div class="ex-line"><span>${esc({ rent: "Rent", utilities: "Utilities", loan_payment: "Loan payment", membership: "Membership", rental_income_tax: "Tax on rental income" }[i.kind] || i.kind)} · due ${money(i.remainingCents)}</span>${exButton("pay_invoice", i.id, "Pay", !i.remainingCents)}</div>`).join("")}`;
}
function exPersonHtml(r, { compact = false } = {}) {
  livingCurrency=r.currency||"EUR";
  return `${compact ? exHouseholdHtml(r) : ""}${compact ? "" : `${exMindHtml(r)}${livingTaskHtml(r.dynamics)}${livingLifeHistoryHtml(r.dynamics)}<button class="btn btn-teal" data-ex-open-tab="views">Personality, attractiveness & reputation →</button><div class="ex-grid"><section class="ex-card"><h3>Skills & social skills</h3>${r.skills.map((s) => exMeter(s.name, s.value)).join("")}<h4>Social skills</h4>${r.socialSkills.map((s) => exMeter(s.name, s.value, 100, "skill")).join("")}${r.lastCheck ? `<div class="ex-note"><b>Latest W100 check</b><p>${esc(r.lastCheck.skill)} · Roll ${r.lastCheck.roll} / target ${r.lastCheck.threshold} · ${esc({ excellent: "excellent result", success: "success", mixed: "mixed result", setback: "setback" }[r.lastCheck.grade])}</p><small>Skill ${r.lastCheck.skill_rating}, Attribute ${r.lastCheck.attribute_rating}, Pressure ${r.lastCheck.pressure}. A successful roll does not replace consent.</small></div>` : ""}</section><section class="ex-card"><h3>What is on my mind</h3>${r.threats.map((t) => `<div class="ex-note"><b>${esc(exLabels[t.kind] || t.kind)}</b><p>${Math.round(t.probability * 100)}% estimated likelihood · ${esc(t.source || "personal experience")}</p></div>`).join("") || "<p>There is no specific new threat in my personal record right now.</p>"}<h4>Accepted commitments</h4>${r.obligations.map((o) => `<div class="ex-line"><span>${esc(o.title)}<small>${Math.round(o.progress * 100)}% · ${esc({ accepted: "accepted", needs_reschedule: "renegotiate", needs_resources: "resources needed" }[o.status] || o.status)}</small></span>${["needs_reschedule", "needs_resources"].includes(o.status) ? exButton("reschedule_task", o.id, "Renegotiate") : ""}${exButton("decline_task", o.id, "Decline")}</div>`).join("") || "<p>No accepted commitment is currently open.</p>"}${(r.cases || []).length ? "<h4>My documented cases</h4>" : ""}${(r.cases || []).map((c) => `<div class="ex-line"><span>${esc({ theft: "Theft", burglary: "Burglary", fraud: "Suspected fraud", robbery: "Robbery", violence: "Violent incident", illegal_trade: "Suspected illegal trade", exploitation: "Exploitation" }[c.kind] || c.kind)}<small>${esc({ unreported: "Not yet reported", reported: "Statement recorded", investigating: "Under review", resolved: "Fictional case concluded with evidence", closed_inconclusive: "Closed without sufficient evidence of guilt" }[c.status] || c.status)} · actual loss ${money(c.lossCents)}</small></span>${c.ownRole === "victim" && !c.reported ? exButton("report_case", c.id, "Report incident") : ""}</div>`).join("")}<h4>Reputation</h4>${exMeter("Helpfulness", r.reputation.helpfulness)}${exMeter("Reliability", r.reputation.reliability)}${exMeter("Public recognition", r.reputation.recognition)}${exMeter("Visible possessions", r.reputation.visibleStatus)}<small>${esc(r.reputation.note)}</small><details><summary>Known sources</summary>${r.reputation.sources.map((s) => "<p>" + esc(s.statement) + (s.verified ? " · verified" : " · unverified") + "</p>").join("") || "<p>No new verified statements yet.</p>"}</details>${r.health ? "<h4>Support</h4><p>Counseling is available regardless of wealth or possessions.</p>" + exButton("support", null, "Arrange counseling") + `<details><summary>Optional private adult role</summary><p>Off by default. No details are narrated; only an actual private encounter between two adults who consent independently may be billed. Financial need and role selection do not replace specific consent.</p><button class="btn btn-soft small" id="ex-adult-role">Open my role preferences</button></details>` : ""}</section></div>`}`;
}
function exJobsHtml(data) {
  return `${exApplicationHistory(data.person, "job")}<div class="ex-note"><b>Work that suits me</b><p>Desired minimum take-home pay: ${money(data.person.expectations.minimumNetCents)} · maximum commute: ${Math.round(data.person.expectations.maxCommuteSeconds / 60)} minutes. Qualifications, demonstrated skills, and documented experience at this employer all matter.</p><button class="btn btn-soft small" id="ex-expectations">Adjust my preferences</button></div><div class="ex-grid">${
    data.jobs
      .filter((j) => j.slots > 0)
      .map(
        (j) =>
          `<article class="ex-card"><small>${esc(j.firmName)}</small><h3>${esc(j.title)}</h3><div class="ex-probs"><span>${money(j.grossMonthlyCents)} gross</span><span>approx. ${money(j.estimatedNetCents)} net</span><span>${j.slots} open positions</span></div><p>${j.hoursPerDay} hours per workday${j.holiday ? " · safe holiday job with guardian consent" : ""}</p>${exMeter("My skill / requirement " + Math.round(j.minimumSkill * 100), j.assessment.skill)}<p class="${j.assessment.eligible ? "ex-positive" : "ex-muted"}">${j.assessment.eligible ? `Requirements met. Chance of an offer: ${Math.floor(j.assessment.probability * 100)}%.` : esc(j.assessment.reasons.join(" · "))}</p>${exButton("apply_job", j.id, "Apply", !j.assessment.eligible)} ${exButton("leisure", "course", "Develop a skill")}</article>`,
      )
      .join("") ||
    "<p>There are no open positions right now. Existing contracts and accessible training remain in place.</p>"
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
      sub: "A daily life with opportunities, relationships, and meaningful choices",
    }) +
    '<main class="screen ex-screen" tabindex="-1" aria-label="Town life"><div class="ex-page"><p>Loading town life…</p></div></main>';
  bindChrome();
  let data = await api(
    lwPath() +
      "/economy" +
      (expandedSim ? "?simId=" + encodeURIComponent(expandedSim) : ""),
  );
  expandedSim = data.selectedSimId;
  exFinanceReport = null;
  exFinanceScope = "combined";
  exFinancePeriod = "current";
  const screen = $(".ex-screen"),
    scrollPositions = new Map();
  let financeRequestVersion = 0;
  const tabs = [
    ["overview", "My daily life"],
    ["finances", "Finances"],
    ["education", "Work & education"],
    ["jobs", "Job board"],
    ["housing", "Housing board"],
    ["leisure", "Leisure & possessions"],
    ["views", "Personality & reputation"],
    ["news", "News & town hall"],
  ];
  const changeTab = (id, focus = false) => {
    if (!tabs.some(([key]) => key === id)) return;
    scrollPositions.set(expandedTab, screen.scrollTop);
    expandedTab = id;
    render();
    screen.scrollTop = scrollPositions.get(id) || 0;
    if (focus) $("[data-ex-tab='" + id + "']").focus({ preventScroll: true });
  };
  const render = () => {
    const savedScroll = screen.scrollTop;
    const r = data.person;livingCurrency=r.currency||"EUR";
    $(".ex-page").innerHTML =
      `<header class="ex-heading"><small>${esc(world.title)}</small><h1>What’s possible today ${r.currency==="USD"?exInfo("local_economy"):""}</h1><p>${new Date(r.date || data.clock * 1000 + Date.UTC(2026, 8, 21)).toLocaleString(getLang()==="en"?"en-US":"de-DE")} · ${data.summary.population} residents</p></header><div class="ex-workspace"><div class="ex-person">${r.sim.asset_id ? `<img class="ex-portrait" alt="" src="/api/living/library/${r.sim.asset_id}?variant=sprite">` : ""}<button class="btn btn-soft" id="ex-sim-picker" aria-label="Switch Sim: ${esc(r.sim.name)}">${esc(r.sim.name)} · ${r.sim.age} ▾</button><div class="ex-current-status">${esc(r.activityStatus.label)} ${exInfo("status")}${r.activityStatus.placeName ? `<small>${esc(r.activityStatus.placeName)}</small>` : ""}</div><div class="ex-shortcuts"><button class="btn btn-teal small" id="ex-play">▶ Play scene</button><button class="btn btn-soft small" id="ex-profile">Profile</button><button class="btn btn-soft small" id="ex-world">World</button><button class="btn btn-soft small" id="ex-bonds">Relationships</button></div></div><nav class="ex-tabs" role="tablist" aria-label="Town life">${tabs.map(([id, name]) => `<button id="ex-tab-${id}" role="tab" tabindex="${expandedTab === id ? 0 : -1}" aria-controls="ex-content" aria-selected="${expandedTab === id}" class="${expandedTab === id ? "active" : ""}" data-ex-tab="${id}">${name}</button>`).join("")}</nav><label class="ex-mobile-nav">Section<select id="ex-section">${tabs.map(([id, name]) => `<option value="${id}" ${expandedTab === id ? "selected" : ""}>${name}</option>`).join("")}</select></label></div><section id="ex-content" role="tabpanel" aria-labelledby="ex-tab-${expandedTab}" tabindex="0"></section><footer class="ex-page-end"><span>You have reached the end of “${esc(tabs.find(([id]) => id === expandedTab)?.[1] || "My daily life")}“.</span><button class="btn btn-soft small" id="ex-back-top">↑ Back to top</button></footer>`;
    const out = $("#ex-content");
    if (expandedTab === "overview") out.innerHTML = exPersonHtml(r);
    else if (expandedTab === "finances") out.innerHTML = exFinanceHtml(r);
    else if (expandedTab === "education") out.innerHTML = exEducationHtml(r);
    else if (expandedTab === "jobs") out.innerHTML = exJobsHtml(data);
    else if (expandedTab === "housing")
      out.innerHTML = `<div class="ex-note"><h3>A home that fits</h3><p>Available homes for ${r.household.members.length} people, matched to confirmed income and the chosen budget. Signing a contract creates actual travel routes and records the move.</p></div><div class="ex-grid">${data.housing.map((h) => `<article class="ex-card"><h3>${esc(h.name)}</h3><p>${money(h.rentCents)} rent · ${money(h.depositCents)} deposit held</p><p>Capacity: ${h.capacity} people · ${exInfo("cold_rent")}${exInfo("deposit")}</p><p>${h.assessment.eligible ? `Estimated chance of approval: ${Math.floor(h.assessment.probability * 100)}% ${exInfo("application")}` : esc(h.assessment.reasons.join(" · "))}</p><details><summary>What matters in this application</summary>${h.assessment.factors.map((f) => `<p>${esc(f.label)}: ${esc(f.value)}</p>`).join("")}</details>${exMeter("Condition", h.condition)}${exButton("move", h.id, "Apply to rent", r.sim.age < 18 || !h.assessment.eligible)} <button class="btn btn-soft small" data-ex-property="${h.id}" data-price="${h.valueCents}" ${r.sim.age < 18 ? "disabled" : ""}>Review purchase / financing</button> ${exButton("move_help", h.id, "Explore housing support", r.sim.age < 18)}</article>`).join("") || "<p>No suitable home is currently available. Housing advice and protected accommodation remain available.</p>"}</div>${exApplicationHistory(r, "housing")}<h3>Property · separate from your home</h3>${r.propertyAssets.map((p) => `<div class="ex-card"><b>${esc(p.name)}</b><p>Estimated property value ${money(p.valueCents)} · ${p.residents.length ? "occupied" : "vacant"} · rental offer ${money(p.rentCents)}</p></div>`).join("") || "<p>No property owned.</p>"}`;
    else if (expandedTab === "views")
      out.innerHTML =
        livingStandingHtml(r)+livingDynamicsHtml(r,{tasks:false})+`<section class="ex-social"><h2>My perspective on our encounters ${exInfo("tom")}</h2>` +
        exSocialHtml(r.socialViews) +
        "</section>";
    else if (expandedTab === "leisure")
      out.innerHTML = `<div class="ex-grid">${data.activities.map((a) => `<article class="ex-card"><h3>${esc(a.name)}</h3><p>${esc(a.effects)}</p><small>${esc(a.access)} · ${esc(a.accounting)}</small><p>${a.minCents === 0 ? "Free option" : money(a.minCents) + " – " + money(a.maxCents)}</p>${exButton(/member|pass|club/.test(a.id) ? "membership" : "leisure", a.id, "Plan", !a.offer.ok)}${!a.offer.ok ? '<p class="ex-muted">' + esc(a.offer.reason) + "</p>" : ""}</article>`).join("")}</div><h3>My special possessions</h3><div class="ex-grid">${r.items.map((i) => `<article class="ex-card"><h4>${esc(i.name)}</h4>${exMeter("Condition", i.condition)}<p>${i.loanedTo ? "on loan" : "available"} · ${i.publiclyDisplayed ? "on public display" : "private"}</p>${i.ownerId === r.sim.id ? `<button class="btn btn-soft small" data-ex-display="${i.id}" data-enabled="${!i.publiclyDisplayed}">${i.publiclyDisplayed ? "Keep private" : "Display publicly"}</button>${!i.loanedTo ? `<button class="btn btn-soft small" data-ex-transfer="${i.id}">Gift / lend</button>` : ""}` : exButton("return_item", i.id, "Return")}</article>`).join("") || "<p>No special possessions. The library, park, and neighborhood are available even without purchases.</p>"}</div><details><summary>Browse purchases</summary><div class="ex-grid">${data.items
        .filter((i) => i.maxCents > 0)
        .map(
          (i) =>
            `<article class="ex-card"><h4>${esc(i.name)}</h4><p>${esc(i.use)}</p><p>${money(Math.round((i.minCents + i.maxCents) / 2))}</p>${exButton("buy_item", i.id, "Review purchase")}</article>`,
        )
        .join("")}</div></details>${r.subscriptions
        .filter((s) => s.status === "active")
        .map(
          (s) =>
            `<div class="ex-line"><span>${esc(s.activityId)} · ${money(s.monthlyCents)} monthly</span>${exButton("cancel_membership", s.id, "Cancel")}</div>`,
        )
        .join("")}`;
    else
      out.innerHTML = `<div class="ex-grid"><section class="ex-card"><small>${r.currency==="USD"?"BENNINGTON GAZETTE":"TOWN GAZETTE"}</small><h2>What is happening in town</h2>${data.news.map((n) => `<article class="ex-news"><small>${new Date(Date.UTC(2026, 8, 21) + n.at * 1000).toLocaleDateString(getLang()==="en"?"en-US":"de-DE")} · documented town event</small><h3>${esc(n.title)}</h3><p>${esc(n.body)}</p>${n.editorial ? "<p><i>" + esc(n.editorial) + "</i> · Storyteller’s comments" : `<button class="btn btn-soft small" data-ex-editorial="${n.id}">Add a comment with your own language model</button>`}</article>`).join("") || "<p>The first edition will appear with the next time step.</p>"}</section><section class="ex-card"><h3>Town hall & shared funds</h3>${data.institutions.map((i) => `<div class="ex-line"><span>${esc(i.name)}<small>${i.monthlyRegionalGrantCents ? "Allocated monthly regional funds " + money(i.monthlyRegionalGrantCents) : "Separate, actually funded account"}${i.reserveCents ? " · protected reserve " + money(i.reserveCents) : ""}</small></span><b>${money(i.cashCents)}</b></div>`).join("")}<p class="ex-muted">Fictional German game economy: taxes, social insurance, healthcare, and town funds remain separate. Regional funds and trade with other towns are recorded explicitly.</p>${exButton("festival", null, "Review an open festival funded by the town", r.sim.age < 18)} ${exButton("donate", null, "Contribute €25 voluntarily", r.sim.age < 18)}<details><summary>Rules for money and safety</summary><p>Residential rent is recorded without VAT; positive rental income is taxed. Pay accounts for fictional income tax and employee and employer contributions. Financial hardship never forces consent in a relationship or commission of a crime.</p><p>Adult modules involving crime and risky consumption are abstract. Minors are never assigned sexual activity or adult roles. Romantic attraction is zero under age 14; for ages 14–17 it is capped at 0.35 and limited to age-appropriate teen romance with an age gap of no more than one year.</p></details></section></div>`;
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
    $$("[data-ex-tab]").forEach((b) => {
      // Chromium can scroll a focused sticky button to its original layout
      // position before onclick. Keep the viewport, then focus the new tab.
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => changeTab(b.dataset.exTab, true);
    });
    $("#ex-section").onchange = (e) => changeTab(e.target.value);
    $(".ex-tabs").onkeydown = (e) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      e.preventDefault();
      const index = tabs.findIndex(([id]) => id === expandedTab);
      changeTab(
        tabs[
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : (index + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                tabs.length
        ][0],
        true,
      );
    };
    $("#ex-back-top").onclick = () => {
      screen.scrollTo({
        top: 0,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      $("#ex-sim-picker").focus({ preventScroll: true });
    };
    $("#ex-world").onclick = () => livingWorldJump(r.sim.id);
    $("#ex-bonds").onclick = () => livingBondsJump(r.sim.id);
    exBindSocial(out);
    $$("[data-ex-open-tab]", out).forEach(
      (b) => (b.onclick = () => changeTab(b.dataset.exOpenTab, true)),
    );
    const refreshFinance = async (offset = 0) => {
      const request = ++financeRequestVersion,
        open = $(".ex-transactions", out)?.open,
        top = screen.scrollTop;
      const report = await api(
        lwPath() +
          `/sims/${r.sim.id}/finances?scope=${exFinanceScope}&offset=${offset}`,
      );
      if (
        request !== financeRequestVersion ||
        expandedSim !== r.sim.id ||
        expandedTab !== "finances"
      )
        return;
      exFinanceReport = report;
      render();
      if (open || offset > 0) $(".ex-transactions").open = true;
      screen.scrollTop = top;
    };
    const period = $("#ex-finance-period", out),
      scope = $("#ex-finance-scope", out);
    if (period)
      period.onchange = () => {
        exFinancePeriod = period.value;
        refreshFinance().catch(fail);
      };
    if (scope)
      scope.onchange = () => {
        exFinanceScope = scope.value;
        refreshFinance().catch(fail);
      };
    $$("[data-ex-ledger-page]", out).forEach(
      (b) =>
        (b.onclick = () =>
          refreshFinance(Number(b.dataset.exLedgerPage)).catch(fail)),
    );
    screen.scrollTop = savedScroll;
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
        exFinanceReport = null;
        data = await api(lwPath() + "/economy?simId=" + r.sim.id);
        if (expandedTab === "finances" && exFinanceScope !== "combined")
          exFinanceReport = await api(
            lwPath() + `/sims/${r.sim.id}/finances?scope=${exFinanceScope}`,
          );
        render();
      } catch (e) {
        fail(e);
      }
    };
    $$("[data-econ-kind]").forEach(
      (b) => (b.onclick = () => b.dataset.econKind==="support"?livingSupportDialog(r,extra=>act("support",b.dataset.econId,extra)):act(b.dataset.econKind, b.dataset.econId)),
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
            "Arrange a shared item transfer",
            "Only familiar Sims who are present can actually receive an item.",
            `<label>Recipient<select id="ex-item-target">${r.localContacts.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label><label>Arrangement<select id="ex-item-kind"><option value="lend_item">Lend temporarily</option><option value="gift_item">Give permanently</option></select></label><label><input type="checkbox" id="ex-item-consent"> Both Sims consent to this specific transfer.</label><button class="btn btn-primary" id="ex-item-submit" ${r.localContacts.length ? "" : "disabled"}>Review arrangement</button>`,
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
    const reserve = $("#ex-reserve-form", out);
    if (reserve)
      reserve.onsubmit = (e) => {
        e.preventDefault();
        if (reserve.reportValidity())
          act("reserve", null, {
            amountCents: Math.round(Number($("#ex-reserve", out).value) * 100),
          });
      };
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
              "Property ownership and financing",
              "A purchase does not automatically change your home. Expected rent is not guaranteed income.",
              `<p>Purchase price ${money(price)} · financing requires at least ${money(Math.ceil(price * 0.2))} in own funds, plus ${money(250000)} protected reserve.</p><label>Own funds (${livingCurrency})<input id="ex-down" type="number" min="0" value="${Math.ceil(price * 0.2) / 100}"></label><label>Term (months)<input id="ex-term" type="number" min="12" max="360" value="240"></label><label><input type="checkbox" id="ex-property-consent"> I explicitly consent</label><button class="btn btn-primary" id="ex-property-submit">Review financing</button><button class="btn btn-soft" id="ex-property-cash">Buy with own funds</button>`,
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
          "My preferences",
          "Suitable jobs instead of arbitrary automatic work",
          `<label>Minimum net (${livingCurrency})<input id="ex-net" type="number" min="0" max="30000" value="${r.expectations.minimumNetCents / 100}"></label><label>Maximum commute (minutes)<input id="ex-commute" type="number" min="1" max="240" value="${r.expectations.maxCommuteSeconds / 60}"></label><button class="btn btn-primary" id="ex-save-expectations">Apply</button>`,
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
      r.sim.name + " · household & skills",
      "My funds, agreed household plan, and actual experience",
      `<div class="ex-profile"><p><b>${esc(r.activityStatus.label)}</b> ${exInfo("status")}</p><div class="ex-shortcuts"><button class="btn btn-soft" id="ex-open-finances">Finances</button><button class="btn btn-soft" id="ex-open-education">Work & education</button></div>${exPersonHtml(r)}<button class="btn btn-teal" id="ex-open-city">Open jobs, housing, and social perspective</button></div>`,
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
    (b) => (b.onclick = () => b.dataset.econKind==="support"?livingSupportDialog(r,extra=>act("support",b.dataset.econId,extra)):act(b.dataset.econKind, b.dataset.econId)),
  );
  exBindPreferences(m, r, act);
  const loan = $("#ex-loan-plan", m);
  if (loan)
    loan.onclick = () => exLoanDialog((values) => act("loan", null, values));
  const join = $("#ex-household-join", m);
  if (join) join.onclick = () => exHouseholdDialog(r, act);
  $("#ex-open-finances", m).onclick = () => {
    expandedTab = "finances";
    $("#ex-open-city", m).click();
  };
  $("#ex-open-education", m).onclick = () => {
    expandedTab = "education";
    $("#ex-open-city", m).click();
  };
  $("#ex-open-city", m).onclick = () => {
    m.remove();
    $$(".lw-profile").forEach((el) => el.remove());
    expandedSim = id;
    const target = `#/city?w=${S.world}&s=${id}`;
    if (location.hash === target) livingEconomyScreen().catch(fail);
    else nav(target);
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
      ? "Decision saved in your personal record."
      : result.reason ||
          result.reasons?.join("; ") ||
          "This action is not available yet.",
    result.ok || result.status === "declined" || result.status === "cooldown"
      ? ""
      : "err",
  );
  S.worldData = null;
  return result;
}
function exLoanDialog(submit) {
  const m = lwModal(
    "Review loan",
    "A payout creates a new debt; your consent does not replace a review of the financing offer.",
    `<label>Amount (€)<input type="number" id="ex-loan-amount" min="100" max="50000" value="1000"></label><label>Term (months)<input type="number" id="ex-loan-months" min="1" max="120" value="12"></label><label><input type="checkbox" id="ex-loan-consent"> This Sim explicitly accepts the obligation.</label><button class="btn btn-primary" id="ex-loan-submit">Review offer</button>`,
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
  return `<details><summary>Actual income, spending, and transactions</summary>${months
    .slice(0, 3)
    .map(
      ([month, f]) =>
        `<p>${esc(month)} · received ${money(f.incomeCents)} · spent ${money(f.spendingCents)}</p>`,
    )
    .join(
      "",
    )}${(r.ledger || []).map((t) => `<div class="ex-line"><span>${esc({ groceries: "Groceries", payroll: "Take-home pay", rent: "Rent", internal_household_transfer: "Shared household", loan_principal: "Loan payout", membership: "Membership", activity_fee: "Leisure", funded_support: "Confirmed support" }[t.kind] || t.kind)}<small>${new Date(Date.UTC(2026, 8, 21) + t.at * 1000).toLocaleDateString(getLang()==="en"?"en-US":"de-DE")} · personal or shared account</small></span><b>${money(t.amount_cents)}</b></div>`).join("") || "<p>No new transactions yet.</p>"}</details>`;
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
          "Shared household",
          "All guardians must consent. Joining households does not imply a romantic relationship.",
          `<p>${adults.map((a) => esc(a.name)).join(", ")} must agree to the housing and cost arrangement. Personal accounts remain private; children move with their guardians. The destination is ${esc(other.household.name)}.</p><label><input type="checkbox" id="ex-join-consent"> All adults named here consent to this specific arrangement.</label><button class="btn btn-primary" id="ex-join-submit">Review housing and consent</button>`,
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
        "My voluntary adult role",
        "Off by default; adults 18+ only, private, and non-explicit.",
        `<label>My choice<select id="ex-service-role"><option value="off">Off</option><option value="worker">Voluntary private service role</option><option value="client">Optional adult client role</option></select></label><label><input type="checkbox" id="ex-service-consent"> This Sim freely chooses this role.</label><button class="btn btn-primary" id="ex-service-save">Save my choice</button>`,
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
