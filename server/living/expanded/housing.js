import { decideApplication, latestApplication, APPLICATION_COOLDOWN } from "./applications.js";
import { rows, put, touch, balance, transfer, ownerAccount } from "./store.js";
import {
  householdOf,
  householdForecast,
  householdCash,
  jointFunds,
  fundsOf,
  newInvoice,
  payInvoice,
  flow,
} from "./economy.js";
import { addFeeling } from "../cognition.js";
import { rng } from "../random.js";
export function housingAssessment(d,p,property,time,{support=false}={}) {
  const h=householdOf(d,p),f=householdForecast(d,h,time,{observerId:p.id}),x=property.payload,reasons=[];
  if(p.age<18)reasons.push('An adult guardian is required');
  if(!x.listed || x.residents.length)reasons.push('The property is no longer available');
  if(x.capacity<h.payload.members.length)reasons.push('The home is too small for this household');
  if(p.state.careSupport?.mode==='residential')reasons.push('A move from residential care must be arranged with suitable support');
  const deposit=x.rentCents*2,available=householdCash(d,h);
  if(!support && available<deposit)reasons.push('The deposit is not covered by disclosed shared funds');
  if(support && balance(d,fundsOf(d).social)<deposit)reasons.push('The housing-support deposit is not currently funded');
  const ratio=f.incomeCents?x.rentCents/f.incomeCents:1;
  if(!support && ratio>.5)reasons.push('Base rent exceeds the affordable range based on confirmed income');
  const owner=d.people.get(x.ownerId),known=owner?.relations[p.id];
  const facts=rows(d,'claim').filter(c=>c.payload.subjectId===p.id&&c.payload.verified&&c.payload.public&&c.payload.dimension==='reliability'&&c.payload.expiresAt>time);
  const negative=facts.some(c=>c.payload.value<-.5 && c.payload.confidence>=.8);
  const arrears=f.arrearsCents>0;
  const last=latestApplication(p,'housing',property.id);
  if(last && time-last.at<APPLICATION_COOLDOWN)reasons.push('You may reapply after seven days');
  const reserveFactor=Math.min(.15,Math.max(0,available-deposit)/Math.max(1,x.rentCents*24));
  const probability=Math.max(.15,Math.min(.92,.68+(ratio<.3?.1:ratio<.4?.03:-.08)+reserveFactor+(known?.trust>.7?.04:0)-(negative?.18:0)-(arrears?.08:0)));
  return {eligible:!reasons.length,reasons,probability,factors:[{label:'Disclosed confirmed income / base rent',value:Math.round(ratio*100)+'%'},{label:'Documented deposit and buffer',value:available>=deposit?'covered':'housing support needed'},{label:'Documented reliability',value:negative?'adverse record':'no adverse record'},{label:'Outstanding household bills',value:arrears?'present':'none'}]};
}
export function applyForHousing(d,p,property,time,emit,{support=false}={}) {
  const assessment=housingAssessment(d,p,property,time,{support});
  const decision=decideApplication(d,p,'housing',property.id,time,assessment,emit);
  if(!decision.ok)return {...assessment,...decision};
  const result=moveHousehold(d,householdOf(d,p),property,time,emit,{support});
  if(!result.ok)throw new Error('Accepted housing prerequisites changed: '+result.reason);
  decision.event.facts.contractId=result.leaseId;
  return {...result,application:decision.application};
}
export function housingOffers(d, p, { search = "", maxRentCents = null } = {}) {
  const h = householdOf(d, p),
    f = householdForecast(d, h, d.calendar.payload.lastMinute,{observerId:p.id}),
    budget = maxRentCents ?? Math.max(25000, Math.floor(f.incomeCents * 0.35)),
    terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  return [...d.properties.values()]
    .filter(
      (e) =>
        e.payload.listed &&
        !e.payload.residents.length &&
        e.payload.capacity >= h.payload.members.length &&
        e.payload.rentCents <= budget,
    )
    .map((e) => {
      const place = d.town.places.get(e.payload.buildingId),
        text = (place?.name + " " + place?.purpose).toLowerCase(),
        score =
          terms.reduce((n, t) => n + (text.includes(t) ? 1 : 0), 0) +
          (e.payload.condition || 0.5) * 0.3 +
          (budget - e.payload.rentCents) / Math.max(1, budget);
      return {
        id: e.id,
        name: place?.name,
        buildingId: e.payload.buildingId,
        rentCents: e.payload.rentCents,
        valueCents: e.payload.valueCents,
        depositCents: e.payload.rentCents * 2,
        capacity: e.payload.capacity,
        condition: e.payload.condition,
        score,
        assessment:housingAssessment(d,p,e,d.town.world.seconds),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
export function moveHousehold(
  d,
  h,
  property,
  time,
  emit,
  { support = false } = {},
) {
  const x = property.payload;
  if (x.residents.length || x.capacity < h.payload.members.length)
    return { ok: false, reason: "Home is no longer available or is too small" };
  const p = h.payload.members
    .map((id) => d.people.get(id))
    .find((p) => p.age >= 18);
  if (!p)
    return {
      ok: false,
      reason: "No responsible adult guardian is available",
    };
  const ownResidence = h.payload.members.includes(x.ownerId),
    deposit = ownResidence ? 0 : x.rentCents * 2;
  if (support && balance(d, fundsOf(d).social) < deposit)
    return { ok: false, reason: "The housing-support fund cannot cover the cost" };
  if (!support && !jointFunds(d, h, deposit, time, emit))
    return { ok: false, reason: "The deposit is not covered; consider housing support" };
  const previous = d.properties.get(h.payload.propertyId),
    oldLease = d.entities.get(h.payload.leaseId),
    e = emit(
      "housing_contract",
      p,
      time,
      {
        propertyId: property.id,
        householdId: h.id,
        rentCents: x.rentCents,
        depositCents: deposit,
        private: true,
      },
      h.payload.sharedBy.filter((id) => id !== p.id),
    );
  const escrow = ownerAccount(d, h.id, "deposit") || null;
  let held = escrow;
  if (!held) {
    const { account } = d.accountFunctions;
    held = account(d, "deposit", h.id, {
      metadata: { restricted: true, notSpendable: true },
    });
  }
  if (support) {
    if (
      !transfer(d, fundsOf(d).social, held.id, deposit, {
        key: { kind: "housing_deposit_support", eventId: e.id },
        at: time,
        eventId: e.id,
        kind: "funded_housing_support",
      }).ok
    )
      return { ok: false, reason: "The housing-support fund cannot cover the cost" };
  } else
    transfer(d, h.payload.jointAccountId, held.id, deposit, {
      key: { kind: "deposit", eventId: e.id },
      at: time,
      eventId: e.id,
      kind: "restricted_deposit_transfer",
    });
  if (oldLease) {
    oldLease.payload.status = "ended";
    oldLease.payload.endedAt = time;
    touch(d, oldLease);
  }
  if (previous) {
    previous.payload.residents = previous.payload.residents.filter(
      (id) => id !== h.id,
    );
    previous.payload.listed = false;
    previous.payload.pendingVacancyHouseholdId = h.id;
    previous.payload.listing = "rent";
    previous.payload.rentCents = Math.max(
      30000,
      previous.payload.rentCents || 50000,
    );
    touch(d, previous);
  }
  const lease = put(
    d,
    "lease",
    {
      propertyId: property.id,
      householdId: h.id,
      landlordId: x.ownerId,
      rentCents: x.rentCents,
      depositCents: deposit,
      depositHeldCents: deposit,
      depositAccountId: held.id,
      status: "active",
      startedAt: time,
      nextDueMonth: null,
      arrearsCents: 0,
      missedMonths: 0,
      evictionStage: "none",
      noticeAt: null,
      sourceEventId: e.id,
    },
    { ownerId: h.id },
  );
  x.residents = [h.id];
  x.listed = false;
  h.payload.propertyId = property.id;
  h.payload.leaseId = ownResidence ? null : lease.id;
  if (ownResidence) {
    lease.payload.status = "owner_occupied";
    lease.payload.rentCents = 0;
    touch(d, lease);
  } else {
    const date = new Date(Date.UTC(2026, 8, 21) + time * 1000),
      days = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
      ).getUTCDate(),
      amount = Math.round(
        (x.rentCents * (days - date.getUTCDate() + 1)) / days,
      ),
      landlord =
        ownerAccount(d, x.ownerId, "personal") ||
        ownerAccount(d, x.ownerId, "housing"),
      invoice = newInvoice(d, p, h, "rent", amount, landlord.id, time, emit, {
        leaseId: lease.id,
        period: date.toISOString().slice(0, 7),
        proratedNewContract: true,
      });
    lease.payload.arrearsCents += amount;
    payInvoice(d, invoice, time, emit);
    touch(d, lease);
  }
  h.payload.housingStatus = "moving";
  h.payload.movingSince = time;
  touch(d, property);
  touch(d, h);
  for (const id of h.payload.members) {
    const member = d.people.get(id);
    member.profile.home = { ...x.rooms };
    member.household_id = x.buildingId;
    for(const task of rows(d,'obligation'))if(task.payload.assigneeId===id&&task.payload.householdId===h.id&&['accepted','working'].includes(task.payload.status)&&!['work','care'].includes(task.payload.operator)){task.payload.destinationId=x.rooms.living;touch(d,task);}
    member.state.goal = {
      kind: "relax",
      destination: x.rooms.living,
      expires: time + 86400,
      reason:
        "The new lease is in effect. I am moving into our new home.",
      source: "procedural_housing",
    };
    member.state.economy.housingNotice = null;
  }
  e.description =
    p.name +
    " and the household agree to move into " +
    d.town.places.get(x.buildingId)?.name +
    ". The route and move still have to happen; no one is teleported.";
  return { ok: true, leaseId: lease.id };
}
export function housingDaily(d, time, emit) {
  const day = Math.floor(time / 86400);
  for (const h of d.households.values()) {
    if (h.payload.lastHousingDay === day) continue;
    h.payload.lastHousingDay = day;
    touch(d, h);
    const p = h.payload.members
      .map((id) => d.people.get(id))
      .find((p) => p.age >= 18);
    if (!p) continue;
    if (
      h.payload.housingStatus === "moving" &&
      h.payload.members.every((id) =>
        Object.values(p.profile.home).includes(
          d.people.get(id).state.location_id,
        ),
      )
    ) {
      h.payload.housingStatus = "housed";
      for (const previous of d.properties.values())
        if (previous.payload.pendingVacancyHouseholdId === h.id) {
          previous.payload.listed = true;
          delete previous.payload.pendingVacancyHouseholdId;
          touch(d, previous);
        }
    }
    for (const previous of rows(d, "lease"))
      if (
        previous.payload.householdId === h.id &&
        ["ended", "ended_by_civil_case", "ended_for_care_move"].includes(previous.payload.status) &&
        previous.payload.depositHeldCents > 0 &&
        !h.payload.members.some((id) =>
          Object.values(
            d.properties.get(previous.payload.propertyId)?.payload.rooms || {},
          ).includes(d.people.get(id)?.state.location_id),
        )
      ) {
        const amount = previous.payload.depositHeldCents,
          e = emit("deposit_return", p, time, {
            leaseId: previous.id,
            amountCents: amount,
            private: true,
          });
        if (
          transfer(
            d,
            previous.payload.depositAccountId,
            h.payload.jointAccountId,
            amount,
            {
              key: { kind: "deposit_return", leaseId: previous.id },
              at: time,
              eventId: e.id,
              kind: "restricted_deposit_return",
            },
          ).ok
        ) {
          previous.payload.depositHeldCents = 0;
          touch(d, previous);
          e.description =
            p.name +
            " receives the deposit that was actually held after moving out.";
        }
      }
    for (const previous of d.properties.values())
      if (
        previous.payload.pendingVacancyHouseholdId === h.id &&
        !h.payload.members.some((id) =>
          Object.values(previous.payload.rooms || {}).includes(
            d.people.get(id)?.state.location_id,
          ),
        )
      ) {
        previous.payload.listed = true;
        delete previous.payload.pendingVacancyHouseholdId;
        touch(d, previous);
      }
    // Actual vacancy creates a proportionate rent credit, not a second full
    // month's charge or a fabricated cash refund from an insolvent landlord.
    for (const oldLease of rows(d, "lease")) {
      const x = oldLease.payload;
      if (
        x.householdId !== h.id ||
        !["ended", "ended_by_civil_case", "ended_for_care_move"].includes(x.status) ||
        x.rentCreditProcessed ||
        h.payload.members.some((id) =>
          Object.values(
            d.properties.get(x.propertyId)?.payload.rooms || {},
          ).includes(d.people.get(id)?.state.location_id),
        )
      )
        continue;
      x.rentCreditProcessed = true;
      const date = new Date(Date.UTC(2026, 8, 21) + time * 1000),
        period = date.toISOString().slice(0, 7),
        lastDay = new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
        ).getUTCDate();
      const invoice = rows(d, "invoice").find(
          (i) =>
            i.payload.leaseId === oldLease.id && i.payload.period === period,
        ),
        credit = Math.round(
          (x.rentCents * Math.max(0, lastDay - date.getUTCDate())) / lastDay,
        );
      if (invoice && credit > 0) {
        const ix = invoice.payload,
          netCredit = Math.min(ix.amountCents, credit),
          waived = Math.min(ix.remainingCents, netCredit),
          refund = netCredit - waived,
          e = emit("rent_vacancy_credit", p, time, {
            leaseId: oldLease.id,
            invoiceId: invoice.id,
            creditCents: netCredit,
            private: true,
          });
        ix.originalAmountCents ??= ix.amountCents;
        ix.amountCents -= netCredit;
        ix.remainingCents -= waived;
        ix.creditCents = (ix.creditCents || 0) + netCredit;
        if (!ix.remainingCents) ix.status = "paid";
        touch(d, invoice);
        x.arrearsCents = Math.max(0, x.arrearsCents - waived);
        const available = Math.max(0, balance(d, ix.creditorAccountId)),
          paid = Math.min(refund, available);
        if (paid) {
          transfer(d, ix.creditorAccountId, h.payload.jointAccountId, paid, {
            key: { kind: "rent_vacancy_refund", leaseId: oldLease.id, period },
            at: time,
            eventId: e.id,
            kind: "rent_credit_refund",
          });
          const owner = d.people.get(x.landlordId);
          if (owner) {
            owner.state.economy.rentalReceivedCents = Math.max(
              0,
              (owner.state.economy.rentalReceivedCents || 0) - paid,
            );
            flow(owner, time, "rent_refund", -paid);
          }
          // A reimbursement is shown separately and never a recurring income promise.
          flow(p, time, "rent_credit_refund", paid);
        }
        x.refundReceivableCents = refund - paid;
        x.refundSourceEventId = e.id;
        e.description =
          p.name +
          " receives a prorated rent credit after actually moving out. " +
          (paid
            ? "The covered refund is deposited into the shared account."
            : "Any potential refund remains subject to the landlord’s actual ability to pay.");
      }
      touch(d, oldLease);
    }
    const lease = d.entities.get(h.payload.leaseId),
      x = lease?.payload;
    if (!x || x.status !== "active") continue;
    const overdue = d.invoices.filter(
        (i) => i.payload.leaseId === lease.id && i.payload.remainingCents > 0,
      ),
      oldest = overdue.length
        ? Math.min(...overdue.map((i) => i.payload.dueAt))
        : null,
      age = oldest == null ? 0 : time - oldest;
    x.arrearsCents = overdue.reduce((n, i) => n + i.payload.remainingCents, 0);
    x.missedMonths = new Set(overdue.map((i) => i.payload.period)).size;
    const stage =
      age >= 120 * 86400 && x.missedMonths >= 3
        ? "enforced_case"
        : age >= 90 * 86400 && x.missedMonths >= 2
          ? "civil_case"
          : age >= 60 * 86400 && x.missedMonths >= 2
            ? "notice"
            : age >= 14 * 86400
              ? "reminder"
              : "none";
    if (stage !== x.evictionStage) {
      x.evictionStage = stage;
      const e = emit("housing_notice", p, time, {
        leaseId: lease.id,
        stage,
        arrearsCents: x.arrearsCents,
        private: true,
      });
      e.description =
        p.name +
        " receives a factual notice about the rent arrears: " +
        {
          none: "the matter is resolved",
          reminder: "a reminder and an offer of advice",
          notice: "a formal notice with a deadline and support options",
          civil_case: "a documented civil case with a hearing",
          enforced_case:
            "a concluded fictional civil case requires a change of residence",
        }[stage] +
        ".";
      x.noticeAt = time;
      x.noticeEventId = e.id;
      for (const id of h.payload.sharedBy) {
        const sim = d.people.get(id);
        sim.state.economy.housingNotice = {
          stage,
          leaseId: lease.id,
          eventId: e.id,
          arrearsCents: x.arrearsCents,
        };
        if (stage !== "none")
          addFeeling(
            sim,
            "fear",
            stage === "reminder" ? 0.25 : 0.5,
            time,
            {
              kind: "housing_notice",
              text: "A housing notice that was actually delivered causes concern.",
              evidence_id: e.id,
            },
            { ttl: 3600 },
          );
      }
    }
    touch(d, lease);
    if (stage === "none" || stage === "reminder") continue;
    const cheaper = housingOffers(d, p, {
      maxRentCents: Math.max(
        25000,
        Math.min(
          x.rentCents - 5000,
          Math.floor(householdForecast(d, h, time).incomeCents * 0.35),
        ),
      ),
    });
    if (cheaper.length) {
      const candidate = d.properties.get(cheaper[0].id),
        moved = applyForHousing(d, p, candidate, time, emit, {
          support: householdCash(d, h) < candidate.payload.rentCents * 2,
        });
      if (moved.ok) continue;
    }
    if (stage === "enforced_case") {
      const allAdults = h.payload.members.every(
          (id) => d.people.get(id).age >= 18,
        ),
        preferCamp =
          allAdults &&
          d.calendar.payload.venues.camp &&
          rng(d.town.world.seed + ":housing-choice:" + h.id)() < 0.1,
        shelter = preferCamp
          ? d.calendar.payload.venues.camp
          : d.calendar.payload.venues.shelter,
        bed = shelter.rooms[preferCamp ? 1 : 2],
        living = shelter.rooms[preferCamp ? 0 : 1],
        wc = shelter.bath,
        property = d.properties.get(h.payload.propertyId);
      x.status = "ended_by_civil_case";
      if (property) {
        property.payload.residents = property.payload.residents.filter(
          (id) => id !== h.id,
        );
        property.payload.listed = false;
        property.payload.pendingVacancyHouseholdId = h.id;
        touch(d, property);
      }
      h.payload.housingStatus = preferCamp ? "temporary_camp" : "shelter";
      h.payload.propertyId = null;
      h.payload.leaseId = null;
      for (const id of h.payload.members) {
        const member = d.people.get(id);
        member.profile.home = { living, kitchen: living, bath: wc, bed };
        member.state.goal = {
          kind: "relax",
          destination: living,
          expires: time + 86400,
          reason: "We are now going to the protected housing support service.",
          source: "procedural_housing",
        };
      }
      const e = emit("housing_support_route", p, time, {
        householdId: h.id,
        destination: living,
        private: true,
      });
      e.description =
        p.name +
        " plans an accessible route to housing support with the household. Lack of money does not automatically mean living on the street.";
      touch(d, h);
      touch(d, lease);
    }
  }
  // Modest, bounded market adjustment for genuinely vacant dwellings.
  if (day % 7 === 0)
    for (const property of d.properties.values()) {
      const x = property.payload;
      if (x.listed && !x.residents.length && x.lastPriceDay !== day) {
        x.rentCents = Math.max(25000, Math.round(x.rentCents * 0.98));
        x.lastPriceDay = day;
        touch(d, property);
      }
    }
}
export function propertyValue(d, p) {
  return [...d.properties.values()]
    .filter((e) => e.payload.ownerId === p.id)
    .reduce((n, e) => n + e.payload.valueCents, 0);
}
export function buyProperty(
  d,
  p,
  property,
  time,
  emit,
  { consent = false } = {},
) {
  const x = property.payload;
  if (p.age < 18 || !consent || !x.listed || x.ownerId === p.id)
    return {
      ok: false,
      reason:
        "The property must be available, and an adult must explicitly choose to buy it",
    };
  const price = x.valueCents,
    buyer = p.state.economy.personalAccountId,
    seller =
      ownerAccount(d, x.ownerId, "personal") ||
      ownerAccount(d, x.ownerId, "housing");
  if (!seller || balance(d, buyer) < price + 250000)
    return {
      ok: false,
      reason:
        "The purchase price and protected reserve are not covered by personal funds",
    };
  const e = emit("property_purchase", p, time, {
    propertyId: property.id,
    priceCents: price,
    private: true,
  });
  if (
    !transfer(d, buyer, seller.id, price, {
      key: { kind: "property_purchase", eventId: e.id },
      at: time,
      eventId: e.id,
      kind: "property_purchase",
    }).ok
  )
    throw new Error("Property payment changed");
  x.ownerId = p.id;
  property.owner_id = p.id;
  x.purchasedAt = time;
  x.purchaseEventId = e.id;
  touch(d, property);
  e.description =
    p.name +
    " purchases a residential property for €" +
    (price / 100).toFixed(0) +
    ". Ownership and the buyer’s residence remain separate; the property remains available to rent.";
  return { ok: true, propertyId: property.id };
}
export function financedPropertyPurchase(
  d,
  p,
  property,
  time,
  emit,
  {
    consent = false,
    downPaymentCents = 0,
    months = 240,
    annualRate = 0.045,
  } = {},
) {
  const x = property.payload;
  if (
    p.age < 18 ||
    !consent ||
    !x.listed ||
    x.ownerId === p.id ||
    !Number.isSafeInteger(downPaymentCents) ||
    downPaymentCents < x.valueCents * 0.2 ||
    downPaymentCents > x.valueCents ||
    !Number.isInteger(months) ||
    months < 12 ||
    months > 360
  )
    return {
      ok: false,
      reason:
        "At least 20% down and an explicitly accepted adult financing agreement are required",
    };
  const h = d.households.get(p.state.economy.householdId),
    f = householdForecast(d, h, time),
    amount = x.valueCents - downPaymentCents,
    i = annualRate / 12,
    payment = Math.round((amount * i) / (1 - Math.pow(1 + i, -months))),
    buyer = p.state.economy.personalAccountId,
    seller =
      ownerAccount(d, x.ownerId, "personal") ||
      ownerAccount(d, x.ownerId, "housing");
  if (
    !seller ||
    balance(d, buyer) < downPaymentCents + 250000 ||
    balance(d, fundsOf(d).bank) < amount ||
    payment > f.incomeCents * 0.35 ||
    payment > f.marginCents
  )
    return {
      ok: false,
      reason:
        "The payment, down payment, reserves, or available loan fund are insufficient. Expected rent is not guaranteed income",
    };
  const e = emit("mortgage_property_purchase", p, time, {
    propertyId: property.id,
    priceCents: x.valueCents,
    principalCents: amount,
    downPaymentCents,
    paymentCents: payment,
    private: true,
  });
  transfer(d, fundsOf(d).bank, buyer, amount, {
    key: { kind: "mortgage_principal", eventId: e.id },
    at: time,
    eventId: e.id,
    kind: "loan_principal",
  });
  transfer(d, buyer, seller.id, x.valueCents, {
    key: { kind: "mortgage_purchase", eventId: e.id },
    at: time,
    eventId: e.id,
    kind: "property_purchase",
  });
  const loan = put(
    d,
    "loan",
    {
      borrowerId: p.id,
      lenderId: null,
      lenderAccountId: fundsOf(d).bank,
      originalPrincipalCents: amount,
      principalCents: amount,
      annualRate,
      months,
      paymentCents: payment,
      startedAt: time,
      status: "active",
      missedMonths: 0,
      sourceEventId: e.id,
      purpose: "mortgage",
      collateralPropertyId: property.id,
      lastDueMonth: new Date(Date.UTC(2026, 8, 21) + time * 1000)
        .toISOString()
        .slice(0, 7),
    },
    { ownerId: p.id },
  );
  d.loans.push(loan);
  x.ownerId = p.id;
  property.owner_id = p.id;
  x.mortgageId = loan.id;
  x.purchaseEventId = e.id;
  touch(d, property);
  e.description =
    p.name +
    " purchases a residential property with a down payment and a funded mortgage. Debt, ownership, ongoing payments, and location are recorded separately.";
  return { ok: true, propertyId: property.id, loanId: loan.id };
}
export function propertyMaintenance(d, time, emit) {
  const month = new Date(Date.UTC(2026, 8, 21) + time * 1000)
    .toISOString()
    .slice(0, 7);
  for (const prop of d.properties.values()) {
    const x = prop.payload;
    if (x.lastMaintenanceMonth === month) continue;
    x.lastMaintenanceMonth = month;
    x.condition = Math.max(0.15, x.condition - 0.012);
    const owner = d.people.get(x.ownerId),
      account =
        ownerAccount(d, x.ownerId, "personal") ||
        ownerAccount(d, x.ownerId, "housing"),
      amount = Math.max(1000, Math.round(x.valueCents * 0.00025));
    if (
      account &&
      balance(d, account.id) > amount + 20000 &&
      x.condition < 0.8
    ) {
      const p = owner || [...d.people.values()].find((p) => p.age >= 18),
        e = emit("property_maintenance", p, time, {
          propertyId: prop.id,
          amountCents: amount,
          private: true,
        });
      if (
        transfer(d, account.id, fundsOf(d).external, amount, {
          key: { kind: "property_maintenance", propertyId: prop.id, month },
          at: time,
          eventId: e.id,
          kind: "maintenance",
        }).ok
      ) {
        x.condition = Math.min(0.95, x.condition + 0.02);
        if (owner)
          owner.state.economy.rentalCostsCents =
            (owner.state.economy.rentalCostsCents || 0) + amount;
        e.description =
          "Funded maintenance is carried out at " +
          d.town.places.get(x.buildingId)?.name +
          ".";
      }
    }
    touch(d, prop);
  }
}
