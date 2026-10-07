import {birthdayTransition} from "./progression.js";
import {rowsFor} from "./store.js";
import { currentEducation } from './education.js';
import { careAction } from './care.js';
import { rng } from "../random.js";
import { addFeeling } from "../cognition.js";
import { rows, put, touch, balance, transfer, post } from "./store.js";
import { DUTIES, ACTIVITIES, ITEMS, JOBS, calendarDate } from "./catalog.js";
import {
  householdOf,
  householdForecast,
  ownAccount,
  fundsOf,
  shopping,
  payInvoice,
  flow,
} from "./economy.js";
import { check, train } from "./percentile.js";
const dutyById = new Map(DUTIES.map((r) => [r.id, r]));
export function installExpandedActions(catalog) {
  // Existing public/private action checks remain in availableActions. New
  // actions are admitted only by the typed eligibility functions below.
  for (const [key, label, objects, duration] of [
    ['elder_care','supports a family member in daily life',['sofa','bed','desk','table','fridge'],900],
    ['study','studies in a current degree or training program',['desk','bookshelf','table','lab_station'],1800],
    [
      "obligation",
      "works on an accepted daily task",
      ["desk", "table", "sofa", "fridge", "bed", "bench", "planter"],
      900,
    ],
    ["holiday_work", "works at a safe holiday job", ["shop_counter"], 1800],
    [
      "training",
      "practices a skill related to a personal goal",
      ["desk", "bookshelf"],
      1800,
    ],
    [
      "item_use",
      "uses a special item they own",
      ["desk", "table", "sofa"],
      1800,
    ],
    [
      "infant_care",
      "cares for a young child",
      ["sofa", "bed", "table", "desk", "fridge"],
      900,
    ],
    [
      "supported_care",
      "attends agreed counseling",
      ["desk", "sofa"],
      1800,
    ],
  ])
    catalog.actions["leisure_expanded_" + key] = {
      label,
      object_kinds: objects,
      duration,
      relief: {},
      thought: label,
    };
  return catalog;
}
export function dutyEligibility(d, p, row, time) {
  const h = householdOf(d, p),
    members = h.payload.members.map((id) => d.people.get(id)),
    x = h.payload.taskState || {},
    family = row.operator,
    title = row.title.toLowerCase();
  if (p.age < row.execution.age || p.state.needs.fatigue > 0.9) return false;
  if (p.state.careSupport?.level==='high' && ['work','care','household'].includes(family)) return false;
  if (
    family === "learning" &&
    !((p.age >= 6 && p.age < 18) || p.profile.job === "Student")
  )
    return false;
  if (
    family === "care" &&
    !members.some((m) => m.id !== p.id && (m.age < 12 || m.age >= 75)) &&
    !p.state.economy.health.supportPlanId
  )
    return false;
  if (family === "work" && !d.contracts.has(p.id)) return false;
  if (
    family === "finance" &&
    !d.invoices.some(
      (i) => i.payload.simId === p.id || i.payload.householdId === h.id,
    ) &&
    !d.loans.some((l) => l.payload.borrowerId === p.id) &&
    !d.contracts.has(p.id)
  )
    return false;
  if (
    /baby|windel/.test(title) &&
    !members.some(
      (m) => m.age < 3 && m.profile.family.parent_ids.includes(p.id),
    )
  )
    return false;
  if (
    /kind|schulbrot|schulranzen|sportzeug|hausaufgab/.test(title) &&
    !members.some((m) => m.age >= 3 && m.age < 18)
  )
    return false;
  if (/haustier|hund/.test(title) && !x.pet) return false;
  if (/spülmaschine/.test(title) && !x.fixtures?.includes("dishwasher"))
    return false;
  if (/waschmaschine/.test(title) && !x.fixtures?.includes("washing_machine"))
    return false;
  if (
    /einnahme|hilfsmittel/.test(title) &&
    !rows(d, "health_plan").some(
      (q) =>
        members.some((m) => m.id === q.payload.simId) &&
        q.payload.status === "active",
    )
  )
    return false;
  if (/schnee/.test(title) && d.calendar.payload.weather?.type !== "snow")
    return false;
  if (
    /geburtstag|geschenk/.test(title) &&
    !members.some((m) => m.state.birthdayToday)
  )
    return false;
  if (/urlaubs/.test(title) && !h.payload.plannedHoliday) return false;
  if (/paket/.test(title) && !h.payload.pendingDelivery) return false;
  if (
    /reparatur/.test(title) &&
    !d.items.some(
      (i) => i.payload.ownerId === p.id && i.payload.condition < 0.65,
    ) &&
    !(d.properties.get(h.payload.propertyId)?.payload.condition < 0.65)
  )
    return false;
  if (
    /rechnung bezahlen/.test(title) &&
    !d.invoices.some(
      (i) =>
        i.payload.status !== "paid" &&
        (i.payload.simId === p.id || i.payload.householdId === h.id),
    )
  )
    return false;
  if (
    /antrag|formular|unterlagen|frist|dokument/.test(title) &&
    !p.state.economy.lastApplicationEventId &&
    !p.state.economy.housingNotice &&
    !p.state.economy.health.supportPlanId
  )
    return false;
  if (/müll|abfall/.test(title) && (x.trash || 0) < 0.3) return false;
  if (/boden|staub|reinigen|flächen/.test(title) && (x.dirt || 0) < 0.25)
    return false;
  if (/wäsche|kleidung/.test(title) && (x.laundry || 0) < 0.25) return false;
  return true;
}
export function assignObligation(
  d,
  p,
  row,
  time,
  emit,
  { targetId = null, issuerId = null } = {},
) {
  if (!dutyEligibility(d, p, row, time))
    return {
      ok: false,
      reason: "The specific requirements for this task are not met",
    };
  const active = rowsFor(d, "obligation", "assigneeId", p.id).filter(
    (o) =>
      o.payload.assigneeId === p.id &&
      ["accepted", "working", "proposed"].includes(o.payload.status),
  );
  if (active.length >= 3 || active.some((o) => o.payload.catalogId === row.id))
    return { ok: false, reason: "Already accepted or task limit reached" };
  // Child chores remain small, age-appropriate and can be declined. A parent
  // is not authority to spend a child's money or manufacture social consent.
  const draw = rng(
      d.town.world.seed +
        ":duty-consent:" +
        p.profile.seed_key +
        ":" +
        row.id +
        ":" +
        Math.floor(time / 86400),
    ),
    accept = p.age >= 18 || (p.state.needs.fun < 0.7 && draw() < 0.8),
    e = emit(
      "obligation_offer",
      p,
      time,
      {
        catalogId: row.id,
        title: row.title,
        issuerId,
        targetId,
        status: accept ? "accepted" : "declined",
        private: true,
      },
      issuerId && issuerId !== p.id ? [issuerId] : [],
    );
  e.description =
    p.name +
    (accept
      ? " takes on a manageable task: "
      : " asks to reschedule: ") +
    row.title +
    ".";
  if (!accept) return { ok: false, declined: true, eventId: e.id };
  const h = householdOf(d, p),
    destination =
      row.operator === "work"
        ? d.contracts.get(p.id) &&
          d.firms.get(d.contracts.get(p.id).payload.firmId).payload.workplaceId
        : row.operator === "learning"
          ? p.profile.home.living
          : row.operator === "food"
            ? p.profile.home.kitchen
            : row.operator === "care" && targetId
              ? d.people.get(targetId)?.state.location_id ||
                p.profile.home.living
              : p.profile.home.living;
  const task = put(
    d,
    "obligation",
    {
      catalogId: row.id,
      title: row.title,
      operator: row.operator,
      assigneeId: p.id,
      issuerId,
      targetId,
      householdId: h.id,
      destinationId: destination,
      status: "accepted",
      acceptedAt: time,
      dueAt: time + 12 * 3600,
      durationSeconds: row.execution.minutes * 60,
      progress: 0,
      sourceEventId: e.id,
      voluntary: true,
      attempts: 0,
    },
    { ownerId: p.id },
  );
  return { ok: true, obligationId: task.id, eventId: e.id };
}
export function rescheduleObligation(d, p, task, time, emit) {
  const x = task.payload,
    row = dutyById.get(x.catalogId);
  if (
    x.assigneeId !== p.id ||
    !["needs_reschedule", "needs_resources", "accepted"].includes(x.status) ||
    !row ||
    !dutyEligibility(d, p, row, time)
  )
    return {
      ok: false,
      reason: "An open task assigned to this Sim and its specific requirements are required",
    };
  const active = rowsFor(d, "obligation", "assigneeId", p.id).filter(
    (o) =>
      o.id !== task.id &&
      o.payload.assigneeId === p.id &&
      o.payload.status === "accepted",
  );
  if (active.length >= 2)
    return {
      ok: false,
      reason: "Finish the already accepted tasks first",
    };
  const e = emit("obligation_rescheduled", p, time, {
    obligationId: task.id,
    private: true,
  });
  x.status = "accepted";
  x.dueAt = time + 36 * 3600;
  x.reschedules = (x.reschedules || 0) + 1;
  x.lastEventId = e.id;
  x.nextAttemptAt = time + 600;
  if (x.operator === "care" && x.targetId) {
    const target = d.people.get(x.targetId);
    if (
      target &&
      Object.values(p.profile.home).includes(target.state.location_id)
    )
      x.destinationId = target.state.location_id;
  }
  touch(d, task);
  e.description =
    p.name +
    " agrees on a realistic new time for " +
    x.title +
    ". Work already completed remains in the record.";
  return { ok: true };
}
export function lifeDaily(d, time, emit) {
  const day = Math.floor(time / 86400),
    date = calendarDate(time);
  for (const p of d.people.values()) {
    if (p.state.lastLifeDay === day) continue;
    p.state.lastLifeDay = day;
    const birth = new Date(p.profile.birthDate + "T00:00:00Z"),
      newAge =
        date.getUTCFullYear() -
        birth.getUTCFullYear() -
        (date.getUTCMonth() < birth.getUTCMonth() ||
        (date.getUTCMonth() === birth.getUTCMonth() &&
          date.getUTCDate() < birth.getUTCDate())
          ? 1
          : 0);
    p.state.birthdayToday =
      date.getUTCMonth() === birth.getUTCMonth() &&
      date.getUTCDate() === birth.getUTCDate();
    if (Number.isFinite(newAge) && newAge > p.age) {
      p.age = newAge;
      const e = emit("birthday", p, time, { age: newAge, public: false });
      e.description = p.name + " turns " + newAge + " today.";
      const holiday = d.contracts.get(p.id);
      if (newAge >= 18 && holiday?.payload.holiday) {
        holiday.payload.status = "ended_at_adult_birthday";
        holiday.payload.endedAt = time;
        holiday.payload.endEventId = e.id;
        touch(d, holiday);
        d.contracts.delete(p.id);
        p.state.economy.employmentId = null;
      }
    }
    if(p.state.birthdayToday) birthdayTransition(d,p,time,emit);
    if (p.age < 18) p.state.economy.health.substances = {}; // Never retain adult-only health/crime state on an underage imported/edited Sim.
  }
  for (const p of d.people.values()) {
    const care = p.state.economy.parentalCare,
      child = care && d.people.get(care.childId);
    if (care && (!child || child.age >= 3)) {
      const e = emit("parental_care_completed", p, time, {
        childId: care.childId,
        private: true,
      });
      e.description =
        p.name +
        " has ended the confirmed caregiving leave; agreed work and suitable childcare can resume.";
      delete p.state.economy.parentalCare;
      const c = d.contracts.get(p.id);
      if (c) {
        delete c.payload.leave;
        touch(d, c);
      }
    }
  }
  for (const h of d.households.values()) {
    if (h.payload.lastLifeDay === day) continue;
    h.payload.lastLifeDay = day;
    const draw = rng(
        d.town.world.seed +
          ":household-duties:" +
          h.payload.originalId +
          ":" +
          day,
      ),
      members = h.payload.members.map((id) => d.people.get(id));
    h.payload.taskState ||= {
      trash: 0.25,
      dirt: 0.2,
      laundry: 0.2,
      toys: members.some((p) => p.age < 12) ? 0.25 : 0,
      pet: draw() < 0.2,
      fixtures:
        draw() < 0.7 ? ["washing_machine", "dishwasher"] : ["washing_machine"],
    };
    const x = h.payload.taskState;
    x.trash = Math.min(1, x.trash + members.length * 0.08);
    x.dirt = Math.min(1, x.dirt + members.length * 0.035);
    x.laundry = Math.min(1, x.laundry + members.length * 0.06);
    touch(d, h);
    for (const p of members) {
      const active = rowsFor(d, "obligation", "assigneeId", p.id).filter(
        (o) =>
          o.payload.assigneeId === p.id &&
          ["accepted", "working"].includes(o.payload.status),
      );
      if (active.length >= 2 || p.age < 6) continue;
      const eligible = DUTIES.filter(
          (r) =>
            dutyEligibility(d, p, r, time) &&
            (!["finance", "work", "care"].includes(r.operator) || p.age >= 18),
        ),
        weighted = eligible
          .map((row) => ({
            row,
            score:
              draw() +
              (row.operator === "learning" && p.age < 18
                ? 0.4
                : row.operator === "household" && x.dirt > 0.6
                  ? 0.3
                  : 0),
          }))
          .sort((a, b) => b.score - a.score);
      if (weighted.length) {
        const target =
          members.find((m) => m.id !== p.id && m.age < 12)?.id || null;
        assignObligation(d, p, weighted[0].row, time, emit, {
          targetId: weighted[0].row.operator === "care" ? target : null,
          issuerId: p.age < 18 ? p.profile.family.parent_ids[0] : null,
        });
      }
    }
  }
  for (const task of rows(d, "obligation")) {
    const x = task.payload;
    const assignee = d.people.get(x.assigneeId);
    if (x.operator === "care" && x.targetId && x.status === "accepted") {
      const target = d.people.get(x.targetId);
      if (
        target &&
        Object.values(assignee.profile.home).includes(
          target.state.location_id,
        ) &&
        !["sleep", "toilet", "shower"].includes(target.state.action?.kind)
      ) {
        x.destinationId = target.state.location_id;
        touch(d, task);
      }
    }
    if (
      ["needs_reschedule", "needs_resources"].includes(x.status) &&
      (x.reschedules || 0) < 2 &&
      x.dueAt < time - 12 * 3600 &&
      (assignee.age >= 18 || assignee.state.needs.fun < 0.5)
    )
      rescheduleObligation(d, assignee, task, time, emit);
    if (["accepted", "working"].includes(x.status) && x.dueAt < time) {
      x.status = "needs_reschedule";
      const p = d.people.get(x.assigneeId),
        e = emit("obligation_overdue", p, time, {
          obligationId: task.id,
          catalogId: x.catalogId,
          private: true,
        });
      e.description =
        p.name +
        " could not complete the accepted task " +
        x.title +
        " yet and is looking for a new time or help.";
      x.lastEventId = e.id;
      touch(d, task);
      addFeeling(p, "disappointment", 0.25, time, {
        kind: "missed_own_plan",
        text: "A personal commitment remained unfinished.",
        evidence_id: e.id,
      });
    }
  }
}
export function selectExpandedAction(d, p, time) {
  const child = d.people.get(p.state.economy.infantCareTargetId);
  if (
    child &&
    child.age < 3 &&
    child.profile.family.parent_ids.includes(p.id) &&
    child.state.location_id === p.state.location_id &&
    Math.max(
      child.state.needs.hunger,
      child.state.needs.thirst,
      child.state.needs.hygiene,
      child.state.needs.bladder,
      child.state.needs.social,
      child.state.needs.fun,
      child.state.needs.comfort,
    ) > 0.45 &&
    Math.max(
      p.state.needs.hunger,
      p.state.needs.bladder,
      p.state.needs.fatigue,
    ) < 0.85
  )
    return "leisure_expanded_infant_care";
  const contract = d.contracts.get(p.id),
    hour = (time / 3600) % 24;
  if (
    contract?.payload.holiday &&
    p.state.location_id ===
      d.firms.get(contract.payload.firmId).payload.workplaceId &&
    hour >= 10 &&
    hour < 14
  )
    return "leisure_expanded_holiday_work";
  if (
    Math.max(
      p.state.needs.hunger,
      p.state.needs.bladder,
      p.state.needs.fatigue,
    ) > 0.75
  )
    return null;
  const task = rowsFor(d, "obligation", "assigneeId", p.id).find(
    (o) =>
      o.payload.assigneeId === p.id &&
      o.payload.status === "accepted" &&
      !(o.payload.nextAttemptAt > time) &&
      o.payload.destinationId === p.state.location_id,
  );
  // Personal chores wait outside school/work commitments. Otherwise selecting a
  // chore during a rest break could start and interrupt it every single minute.
  const onDuty = Math.floor(time / 86400)%7<5 && hour>=8 && hour<(p.age<18?14:16) && (p.age<18 || contract);
  if (task && hour >= 7 && hour < 21 && (!onDuty || (task.payload.operator === "work" && p.state.location_id === p.profile.workplace_id))) {
    p.state.economy.activeObligationId = task.id;
    return "leisure_expanded_obligation";
  }
  if (
    p.profile.job === "Unemployed" &&
    Object.values(p.profile.home).includes(p.state.location_id) &&
    hour >= 9 &&
    hour < 18 &&
    p.state.economy.lastTrainingDay !== Math.floor(time / 86400)
  )
    return "leisure_expanded_training";
  const owned = d.items.find(
    (i) =>
      ((i.payload.ownerId === p.id && !i.payload.loanedTo) ||
        i.payload.loanedTo === p.id) &&
      !i.payload.stolen &&
      i.payload.condition > 0.1 &&
      i.payload.locationId === p.state.location_id &&
      ITEMS.some((s) => s.id === i.payload.catalogId),
  );
  if (owned && p.state.needs.fun > 0.65 && hour >= 7 && hour < 22) {
    p.state.economy.activeItemId = owned.id;
    return "leisure_expanded_item_use";
  }
  return null;
}
export function expandedActionAllowed(d, p, kind, time=d?.town.world.seconds) {
  if (!kind.startsWith("leisure_expanded_")) return true;
  if (!d) return false;
  if (kind === "leisure_expanded_elder_care") return !!careAction(d,p,time);
  if (kind === "leisure_expanded_study") return p.age>=18 && !!currentEducation(p) && p.state.location_id===p.profile.workplace_id && Math.floor(time/86400)%7<5 && time/3600%24>=8 && time/3600%24<15;
  if (kind === "leisure_expanded_holiday_work")
    return (
      p.age >= 15 &&
      p.age < 18 &&
      d.contracts.get(p.id)?.payload.holiday &&
      p.state.economy.guardianPermission
    );
  if (kind === "leisure_expanded_obligation") {
    const task = d.entities.get(p.state.economy.activeObligationId);
    return (
      task?.payload.status === "accepted" &&
      task.payload.assigneeId === p.id &&
      (!task.payload.targetId ||
        task.payload.operator !== "care" ||
        d.people.get(task.payload.targetId)?.state.location_id ===
          p.state.location_id)
    );
  }
  if (kind === "leisure_expanded_training") return p.age >= 15;
  if (kind === "leisure_expanded_item_use")
    return !!p.state.economy.activeItemId;
  if (kind === "leisure_expanded_infant_care")
    return p.age >= 18 && !!p.state.economy.infantCareTargetId;
  if (kind === "leisure_expanded_supported_care")
    return !!p.state.economy.health.supportPlanId;
  return false;
}
export function completedExpandedAction(d, p, event, duration, time) {
  const kind = event.facts.action;
  if (kind === "leisure_expanded_training") {
    const skill = p.state.economy.expectations.preferredSkill,
      grade = check(p, event, {
        skill,
        attribute: "reasoning",
        seed: d.town.world.seed,
      });
    train(p, skill, duration, event, time);
    p.state.economy.lastTrainingDay = Math.floor(time / 86400);
    event.description =
      p.name +
      " practices " +
      skill +
      " for a suitable job. Actual practice counts; no professional qualification is invented.";
    event.facts.practice = {
      skill,
      durationSeconds: duration,
      grade: grade.grade,
    };
    return { practiceSeconds: duration, skill };
  }
  if (kind === "leisure_expanded_item_use") {
    const item = d.entities.get(p.state.economy.activeItemId);
    if (
      !item ||
      !(
        (item.payload.ownerId === p.id && !item.payload.loanedTo) ||
        item.payload.loanedTo === p.id
      ) ||
      item.payload.locationId !== p.state.location_id ||
      item.payload.condition <= 0.1
    )
      return { failed: true };
    const spec = ITEMS.find((s) => s.id === item.payload.catalogId),
      skill = /music|instrument|guitar|piano/.test(spec.skills + " " + spec.id)
        ? "music"
        : /fitness|sport|bike/.test(spec.skills + " " + spec.id)
          ? "fitness"
          : "analysis";
    item.payload.condition = Math.max(0, item.payload.condition - 0.001);
    item.payload.lastUseEventId = event.id;
    touch(d, item);
    train(p, skill, duration, event, time);
    p.state.needs.fun = Math.max(0, p.state.needs.fun - 0.15);
    event.description =
      p.name + " uses " + spec.name + " for " + spec.use + ".";
    event.facts.itemId = item.id;
    return { practiceSeconds: duration, skill };
  }
  if (kind === "leisure_expanded_obligation") {
    const task = d.entities.get(p.state.economy.activeObligationId),
      row = task && dutyById.get(task.payload.catalogId);
    if (
      task &&
      row?.operator === "care" &&
      task.payload.targetId &&
      d.people.get(task.payload.targetId)?.state.location_id !==
        p.state.location_id
    )
      return { failed: true };
    if (
      !task ||
      !row ||
      task.payload.status !== "accepted" ||
      task.payload.destinationId !== p.state.location_id ||
      !dutyEligibility(d, p, row, time)
    )
      return { failed: true };
    const x = task.payload,
      h = householdOf(d, p),
      uncertain =
        /reparatur|prüf|formular|abstimm|konflikt|schicht|hilfsmittel/.test(
          row.title.toLowerCase(),
        ),
      result = uncertain
        ? check(p, event, {
            skill: row.execution.skill,
            attribute: row.execution.attribute,
            difficulty: 0,
            seed: d.town.world.seed,
          })
        : { grade: "success", routine: true },
      gain =
        result.grade === "setback" ? 0.2 : result.grade === "mixed" ? 0.6 : 1;
    x.attempts++;
    x.progress = Math.min(1, x.progress + gain);
    x.status = x.progress >= 1 ? "completed" : "accepted";
    x.lastEventId = event.id;
    x.lastAttemptAt = time;
    x.nextAttemptAt = time + 1800;
    touch(d, task);
    event.facts.obligation = {
      id: task.id,
      catalogId: row.id,
      title: row.title,
      result: result.grade,
      progress: x.progress,
    };
    if (row.operator === "work") {
      event.facts.professionalWork = true;
    }
    if (x.status === "completed") {
      const title = row.title.toLowerCase(),
        s = (h.payload.taskState ||= {
          trash: 0.25,
          dirt: 0.2,
          laundry: 0.2,
          toys: 0,
          pet: false,
          fixtures: ["washing_machine"],
        });
      if (/rechnung bezahlen/.test(title)) {
        const invoice = d.invoices.find(
          (i) =>
            i.payload.remainingCents > 0 &&
            (i.payload.simId === p.id || i.payload.householdId === h.id),
        );
        if (invoice && !payInvoice(d, invoice, time, d.emit)) {
          x.status = "needs_resources";
          x.progress = 0.5;
        }
      }
      if (/müll|abfall/.test(title)) s.trash = Math.max(0, s.trash - 0.5);
      if (/boden|staub|reinigen|fläche/.test(title))
        s.dirt = Math.max(0, s.dirt - 0.4);
      if (/wäsche|kleidung/.test(title))
        s.laundry = Math.max(0, s.laundry - 0.4);
      if (/spielzeug/.test(title)) s.toys = 0;
      if (/lebensmittel einkaufen/.test(title))
        shopping(d, h, time, d.emit, { force: true });
      if (/kleine reparatur durchführen/.test(title)) {
        const item = d.items.find(
          (i) => i.payload.ownerId === p.id && i.payload.condition < 0.65,
        );
        if (item) {
          item.payload.condition = Math.min(1, item.payload.condition + 0.15);
          touch(d, item);
        }
      }
      if (/reparaturhilfe organisieren/.test(title)) {
        const item = d.items.find(
          (i) => i.payload.ownerId === p.id && i.payload.condition < 0.65,
        );
        if (item)
          p.state.economy.repairRequest = {
            itemId: item.id,
            status: "requested",
            sourceEventId: event.id,
          };
      }
      if (row.operator === "care" && x.targetId) {
        const target = d.people.get(x.targetId);
        if (target && target.state.location_id === p.state.location_id) {
          target.state.needs.social = Math.max(
            0,
            target.state.needs.social - 0.12,
          );
          target.state.needs.comfort = Math.max(
            0,
            target.state.needs.comfort - 0.08,
          );
          if (/windel/.test(title)) {
            target.state.needs.hygiene = Math.max(
              0,
              target.state.needs.hygiene - 0.35,
            );
            target.state.needs.bladder = Math.max(
              0,
              target.state.needs.bladder - 0.3,
            );
          }
          event.participants.push(target.id);
          event.facts.careActuallyReceived = true;
        }
      }
      touch(d, h);
      if (x.status === "completed") {
        train(p, row.execution.skill, duration, event, time);
        addFeeling(p, "pride", 0.32, time, {
          kind: "actual_obligation_complete",
          text: "My accepted task is actually complete.",
          evidence_id: event.id,
        });
      }
    }
    event.facts.obligation.progress = x.progress;
    event.facts.obligation.status = x.status;
    event.description =
      p.name +
      " " +
      (x.status === "completed"
        ? "completed"
        : "is making documented progress on") +
      ": " +
      row.title +
      ". " +
      (x.status === "completed"
        ? "The specific task record is complete."
        : "Part of the task remains; help or another attempt may be possible.");
    delete p.state.economy.activeObligationId;
    return { practiceSeconds: duration * gain, skill: row.execution.skill };
  }
  return null;
}
export function activityOfferPrice(spec) {
  return Math.round((spec.minCents + spec.maxCents) / 2);
}
export function buyMembership(d, p, activityId, time, emit) {
  if (p.age < 18)
    return {
      ok: false,
      reason: "A recurring agreement requires an adult guardian",
    };
  const spec = ACTIVITIES.find((s) => s.id === activityId);
  if (
    !spec ||
    !/monat|mitglied|subscription|abo/i.test(spec.accounting + " " + spec.name)
  )
    return { ok: false, reason: "No monthly membership offer is available" };
  if (
    rows(d, "subscription").some(
      (s) =>
        s.payload.simId === p.id &&
        s.payload.activityId === activityId &&
        s.payload.status === "active",
    )
  )
    return { ok: false, reason: "Already a member" };
  const amount = activityOfferPrice(spec);
  if (
    balance(d, ownAccount(d, p)) < amount ||
    householdForecast(d, householdOf(d, p), time).marginCents < amount
  )
    return { ok: false, reason: "No additional recurring expense is affordable" };
  const seller =
      [...d.firms.values()].find((f) => f.payload.role === "Fitness coach") ||
      d.firms.get(d.market.payload.firmId),
    e = emit("membership_accepted", p, time, {
      activityId,
      monthlyCents: amount,
      private: true,
    });
  const vatRate = 0.19,
    net = Math.round(amount / (1 + vatRate));
  post(
    d,
    [
      { accountId: ownAccount(d, p), amount: -amount },
      { accountId: seller.payload.accountId, amount: net },
      { accountId: fundsOf(d).region, amount: amount - net },
    ],
    {
      key: { kind: "membership_start", eventId: e.id },
      at: time,
      eventId: e.id,
      kind: "membership",
    },
  );
  const sub = put(
    d,
    "subscription",
    {
      simId: p.id,
      activityId,
      monthlyCents: amount,
      sellerAccountId: seller.payload.accountId,
      vatRate,
      status: "active",
      startedAt: time,
      lastDueMonth: null,
      nextDueAt: time + 30 * 86400,
      sourceEventId: e.id,
    },
    { ownerId: p.id },
  );
  e.description =
    p.name +
    " chooses " +
    spec.name +
    " as an additional recurring expense.";
  return { ok: true, subscriptionId: sub.id };
}
