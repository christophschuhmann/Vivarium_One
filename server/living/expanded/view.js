import {dynamicsView} from '../social-dynamics.js';
import { financialReport } from "./finances.js";
import { educationView, activityStatus, JOB_LABELS } from "./education.js";
import { careView } from "./care.js";
import { db, pj } from "../../db.js";
import { rows, balance } from "./store.js";
import {
  ownAccount,
  householdOf,
  householdForecast,
  jobAssessment,
} from "./economy.js";
import { housingOffers, propertyValue } from "./housing.js";
import {
  ACTIVITIES,
  ITEMS,
  SKILL_LABELS,
  ATTRIBUTE_LABELS,
  POLICY,
  estimatedNet,
  calendarDate,
} from "./catalog.js";
import { socialMindContext } from "./tom.js";
import { reputationFor } from "./community.js";
import { leisureAccess } from "./leisure.js";
export function personResources(d, p) {
  const h = householdOf(d, p),
    contract = d.contracts.get(p.id),
    forecast = householdForecast(d, h, d.town.world.seconds, {observerId:p.id}),
    invoiceIds = new Set(
      d.invoices
        .filter(
          (i) => i.payload.simId === p.id || i.payload.householdId === h.id,
        )
        .map((i) => i.id),
    );
  return {
    sim: {
      id: p.id,
      name: p.name,
      age: p.age,
      asset_id: p.asset_id,
      locationId: p.state.location_id,
    },
    dynamics:dynamicsView(p,d.town,d),
    currency:JSON.parse(d.town.world.rules||'{}').currency||'EUR',
    workplace:p.profile.workplace_id?{id:p.profile.workplace_id,name:d.town.places.get(p.profile.workplace_id)?.name}:null,
    version: d.town.world.version,
    clock: d.town.world.seconds,
    date: calendarDate(d.town.world.seconds).toISOString(),
    cashCents: balance(d, ownAccount(d, p)),
    activityStatus:activityStatus(p,d.town),
    finances:financialReport(d,p,d.town.world.seconds),
    education:{...educationView(p,d.town),employmentHistory:rows(d,'employment').filter(e=>e.payload.simId===p.id).map(e=>({id:e.id,...e.payload,firmName:d.firms.get(e.payload.firmId)?.payload.name}))},
    care:careView(d,p),
    applications:(p.state.economy.applications || []).slice().reverse().map(a=>({...a,targetName:a.kind==='job'?(d.entities.get(a.targetId)?.payload.title || 'Stelle'):(d.town.places.get(d.properties.get(a.targetId)?.payload.buildingId)?.name || 'Wohnung')})),
    pendingGrossCents: p.state.economy.pendingGrossCents,
    employment: contract
      ? {
          id: contract.id,
          ...contract.payload,
          estimatedNetCents: estimatedNet(contract.payload.grossMonthlyCents),
          firmName: d.firms.get(contract.payload.firmId).payload.name,
        }
      : null,
    household: {
      id: h.id,
      name:
        d.town.places.get(
          d.properties.get(h.payload.propertyId)?.payload.buildingId,
        )?.name || (h.payload.housingStatus==='residential_care'?'Seniorenhaus Lindenblick · '+p.name:"Haushalt in Wohnhilfe"),
      members: h.payload.members.map((id) => {
        const q = d.people.get(id),
          c = d.contracts.get(id);
        return {
          id: q.id,
          name: q.name,
          age: q.age,
          sharedIncome:
            q.state.economy.privacy.shareIncomeWithHousehold && q.age >= 18
              ? q.state.economy.parentalCare
                ? q.state.economy.parentalCare.benefitCents
                : c
                  ? estimatedNet(c.payload.grossMonthlyCents)
                  : q.state.economy.pensionCents ||
                    q.state.economy.approvedBenefitCents ||
                    0
              : null,
        };
      }),
      food: h.payload.food,
      status: h.payload.housingStatus,
      forecast,
      budget: h.payload.budget,
      propertyId: h.payload.propertyId,
      lease: h.payload.leaseId
        ? d.entities.get(h.payload.leaseId)?.payload
        : null,
      goals: h.payload.goals,
    },
    localContacts: [...d.people.values()]
      .filter(
        (q) =>
          q.id !== p.id &&
          q.state.location_id === p.state.location_id &&
          p.relations[q.id]?.trust >= 0.4,
      )
      .slice(0, 30)
      .map((q) => ({ id: q.id, name: q.name, age: q.age })),
    adultService: p.age >= 18 ? p.state.economy.adultService || null : null,
    children: [...d.people.values()]
      .filter((q) => q.age < 18 && q.profile.family.parent_ids.includes(p.id))
      .map((q) => ({
        id: q.id,
        name: q.name,
        age: q.age,
        holidayPermission: q.state.economy.guardianPermission,
      })),
    attributes: Object.entries(p.state.aptitudes.attributes).map(
      ([id, value]) => ({ id, name: ATTRIBUTE_LABELS[id] || id, value }),
    ),
    mind: {
      wellbeing: p.state.wellbeing,
      needs: p.state.needs,
      emotions: p.state.affect,
      goals: p.state.psychology.ambitions,
      thought: p.state.thought,
      mood: p.state.mood,
      current_desire: p.state.current_desire,
    },
    skills: Object.entries(p.state.skills).map(([id, value]) => ({
      id,
      name: SKILL_LABELS[id] || id,
      value,
    })),
    socialSkills: Object.entries(p.state.aptitudes.social_skills).map(
      ([id, value]) => ({ id, name: SKILL_LABELS[id] || id, value }),
    ),
    lastCheck: p.state.aptitudes.last_check,
    credentials: p.state.credentials,
    expectations: p.state.economy.expectations,
    threats: p.state.economy.threats,
    socialViews: socialMindContext(p),
    reputation: reputationFor(d, p, p.id, d.town.world.seconds),
    health: p.age >= 18 ? p.state.economy.health : null,
    cases: rows(d, "case")
      .filter(
        (c) =>
          c.payload.victimId === p.id ||
          c.payload.investigatorId === p.id ||
          c.payload.actorId === p.id,
      )
      .map((c) => ({
        id: c.id,
        kind: c.payload.kind,
        status: c.payload.status,
        lossCents: c.payload.lossCents,
        reported: c.payload.reported,
        ownRole:
          c.payload.victimId === p.id
            ? "victim"
            : c.payload.investigatorId === p.id
              ? "investigator"
              : "actor",
        sourceEventId: c.payload.incidentEventId,
      })),
    items: d.items
      .filter((i) => i.payload.ownerId === p.id || i.payload.loanedTo === p.id)
      .map((i) => ({
        id: i.id,
        ...i.payload,
        name:
          ITEMS.find((x) => x.id === i.payload.catalogId)?.name ||
          i.payload.catalogId,
      })),
    propertyAssets: [...d.properties.values()]
      .filter((e) => e.payload.ownerId === p.id)
      .map((e) => ({
        id: e.id,
        ...e.payload,
        name: d.town.places.get(e.payload.buildingId)?.name,
      })),
    propertyValueCents: propertyValue(d, p),
    loans: d.loans
      .filter(
        (l) => l.payload.borrowerId === p.id || l.payload.lenderId === p.id,
      )
      .map((l) => ({ id: l.id, ...l.payload })),
    invoices: d.invoices
      .filter((i) => invoiceIds.has(i.id))
      .map((i) => ({ id: i.id, ...i.payload })),
    obligations: rows(d, "obligation")
      .filter(
        (o) =>
          o.payload.assigneeId === p.id && o.payload.status !== "completed",
      )
      .slice(-12)
      .map((o) => ({ id: o.id, ...o.payload })),
    subscriptions: rows(d, "subscription")
      .filter((o) => o.payload.simId === p.id)
      .map((o) => ({ id: o.id, ...o.payload })),
    flows: p.state.economy.monthlyFlows,
    ledger: db
      .prepare(
        "SELECT DISTINCT t.id,t.at,t.kind,t.metadata,sum(l.amount_cents) amount_cents FROM lw_money_transactions t JOIN lw_money_legs l ON l.transaction_id=t.id WHERE t.world_id=? AND l.account_id IN (?,?) GROUP BY t.id ORDER BY t.at DESC,t.rowid DESC LIMIT 25",
      )
      .all(d.worldId, ownAccount(d, p), h.payload.jointAccountId)
      .map((t) => ({ ...t, metadata: pj(t.metadata, {}) })),
  };
}
export function townResources(d, { simId = null, search = "" } = {}) {
  const p =
      d.people.get(simId) ||
      [...d.people.values()].find((q) => q.anchored) ||
      [...d.people.values()][0],
    time = d.town.world.seconds,
    terms = String(search).toLowerCase();
  return {
    dynamics:dynamicsView(p,d.town,d),
    currency:JSON.parse(d.town.world.rules||'{}').currency||'EUR',
    workplace:p.profile.workplace_id?{id:p.profile.workplace_id,name:d.town.places.get(p.profile.workplace_id)?.name}:null,
    version: d.town.world.version,
    clock: time,
    selectedSimId: p.id,
    summary: {
      population: d.people.size,
      households: d.households.size,
      unemployed: [...d.people.values()].filter(
        (p) => p.age >= 18 && p.age < 66 && p.profile.job === "Unemployed",
      ).length,
      openJobs: d.jobs.reduce(
        (n, j) => n + (j.payload.expiresAt > time ? j.payload.slots : 0),
        0,
      ),
      vacantHomes: [...d.properties.values()].filter((p) => p.payload.listed)
        .length,
      accounts: d.accounts.size,
      transactions: db
        .prepare(
          "SELECT count(*) n FROM lw_money_transactions WHERE world_id=?",
        )
        .get(d.worldId).n,
    },
    institutions: rows(d, "institution")
      .filter((i) => i.payload.key !== "external")
      .map((i) => ({
        id: i.id,
        name: i.payload.name,
        key: i.payload.key,
        cashCents: balance(d, i.payload.accountId),
        reserveCents: i.payload.reserve || 0,
        monthlyRegionalGrantCents: i.payload.monthlyGrant || 0,
      })),
    jobs: d.jobs
      .filter((j) =>
        (j.payload.title + " " + d.firms.get(j.payload.firmId)?.payload.name)
          .toLowerCase()
          .includes(terms),
      )
      .map((j) => ({
        id: j.id,
        ...j.payload,
        title: JOB_LABELS[j.payload.title] || j.payload.title,
        firmName: d.firms.get(j.payload.firmId)?.payload.name,
        assessment: jobAssessment(d, p, j, time),
      })),
    housing: housingOffers(d, p, { search }),
    news: rows(d, "news")
      .sort((a, b) => b.payload.at - a.payload.at)
      .slice(0, 30)
      .map((e) => ({ id: e.id, ...e.payload })),
    market: d.market.payload,
    activities: ACTIVITIES.filter((a) =>
      (a.name + " " + a.access).toLowerCase().includes(terms),
    ).map((a) => ({ ...a, offer: leisureAccess(d, p, a.id, time) })),
    items: ITEMS,
    person: personResources(d, p),
    policy: { ...POLICY, fictional: true },
    weather: d.calendar.payload.weather,
    festival: d.calendar.payload.festival || null,
  };
}
