import { financialReport, financialAppraisals } from "../living/expanded/finances.js";
import { llmJson } from "../providers.js";
import { withPrincipal } from "../byok.js";
import { preflight, debitCall, EST } from "../credits.js";
import { assertMinorSafeText } from "../living/romance.js";
import { db, j, pj, uid, now } from "../db.js";
import { requireUser, httpErr } from "../auth.js";
import { loadTown, busy, insertEvent } from "../living/engine.js";
import {
  economicDraft,
  ownAccount,
  householdOf,
  applyForJob,
  payInvoice,
  issueLoan,
  buyItem,
  refreshOwnResources,
  householdForecast,
  fundsOf,
} from "../living/expanded/economy.js";
import {
  rows,
  touch,
  balance,
  commitEconomy,
  assertEconomicIntegrity,
} from "../living/expanded/store.js";
import {
  applyForHousing,
  buyProperty,
  financedPropertyPurchase,
} from "../living/expanded/housing.js";
import {
  assignObligation,
  buyMembership,
  rescheduleObligation,
} from "../living/expanded/life.js";
import {
  planLeisure,
  lendItem,
  returnItem,
} from "../living/expanded/leisure.js";
import {
  civicFestival,
  donate,
  requestSupport,
  reportCase,
} from "../living/expanded/community.js";
import { DUTIES } from "../living/expanded/catalog.js";
import { personResources, townResources } from "../living/expanded/view.js";
import { evaluateMind } from "../living/cognition.js";
import { openSimsCatalog } from "../living/open_sims.js";
import { joinHouseholds } from "../living/expanded/households.js";
function own(req) {
  const user = requireUser(req),
    w = db
      .prepare(
        "SELECT * FROM worlds WHERE id=? AND user_id=? AND simulation_mode='living'",
      )
      .get(req.params.worldId, user.id);
  if (!w) throw httpErr(404, "NOT_FOUND", "Stadt nicht gefunden");
  return { user, w, town: loadTown(w.id) };
}
export default async function expandedRoutes(app, options = {}) {
  const newsModel = options.newsModel || llmJson;
  app.get("/api/living/worlds/:worldId/economy", async (req) => {
    const { town } = own(req),
      d = economicDraft(town);
    if (!d)
      throw httpErr(409, "NOT_READY", "Erweiterung noch nicht initialisiert");
    return townResources(d, req.query || {});
  });
  app.get("/api/living/worlds/:worldId/sims/:id/finances", async req => {
    const {town}=own(req),p=town.byId.get(req.params.id);
    if(!p)throw httpErr(404,'NOT_FOUND','Sim nicht gefunden');
    const scope=req.query.scope || 'combined';
    if(!['combined','personal','household'].includes(scope))throw httpErr(400,'BAD_SCOPE','Unbekannter Kontobereich');
    const offset=Math.max(0,Math.min(100000,Math.floor(Number(req.query.offset)||0)));
    return financialReport(economicDraft(town),p,town.world.seconds,{scope,offset,limit:60});
  });
  app.get("/api/living/worlds/:worldId/sims/:id/resources", async (req) => {
    const { town } = own(req),
      p = town.byId.get(req.params.id);
    if (!p) throw httpErr(404, "NOT_FOUND", "Sim nicht gefunden");
    return personResources(economicDraft(town), p);
  });
  app.post("/api/living/worlds/:worldId/news/:id/commentary", async (req) => {
    const { user, w, town } = own(req);
    if (busy.has(w.id)) throw httpErr(409, "BUSY", "Ein Zeitschritt läuft");
    if (req.body?.expectedVersion !== town.world.version)
      throw httpErr(409, "STALE", "Bitte Ansicht aktualisieren");
    const d = economicDraft(town),
      entry = d.entities.get(req.params.id);
    if (entry?.kind !== "news")
      throw httpErr(404, "NOT_FOUND", "Ausgabe nicht gefunden");
    busy.add(w.id);
    try {
      preflight(user.id, EST.chat());
      const result = await withPrincipal(user, () =>
        newsModel(
          [
            {
              role: "system",
              content:
                "Write a short German newspaper commentary about ONLY the supplied public canonical facts. Return strict JSON {commentary:string}, 60-100 words. Commentary is a labelled opinion, never a new factual event. Do not invent names, numbers, crimes, diagnoses, decisions, causes or future facts. Private finances and thoughts are absent. Family friendly.",
            },
            {
              role: "user",
              content: j({
                title: entry.payload.title,
                publicFacts: entry.payload.body,
              }),
            },
          ],
          { maxTokens: 2200, reasoningEffort: "low", temperature: 0.35 },
        ),
      );
      debitCall(user.id, result, "living_news_commentary", { worldId: w.id });
      const output = result.json;
      if (
        !output ||
        typeof output.commentary !== "string" ||
        output.commentary.length < 40 ||
        output.commentary.length > 1400
      )
        throw httpErr(502, "BAD_COMMENTARY", "Kommentar nicht gültig");
      assertMinorSafeText(town.people, output.commentary);
      db.transaction(() => {
        if (
          db.prepare("SELECT version FROM lw_worlds WHERE world_id=?").get(w.id)
            .version !== town.world.version
        )
          throw httpErr(409, "STALE", "Stadt hat sich verändert");
        entry.payload.editorial = output.commentary;
        entry.payload.editorialStatus = "labelled_commentary_not_new_fact";
        entry.payload.editorialAt = town.world.seconds;
        touch(d, entry);
        commitEconomy(d);
        db.prepare(
          "UPDATE lw_worlds SET version=version+1 WHERE world_id=?",
        ).run(w.id);
      })();
      return {
        ok: true,
        version: town.world.version + 1,
        commentary: output.commentary,
      };
    } catch (error) {
      if (
        error instanceof SyntaxError ||
        /JSON unrepairable/.test(error.message)
      )
        throw httpErr(
          502,
          "BAD_COMMENTARY",
          "Der Kommentar war unvollständig. Die ursprüngliche Meldung und die Welt bleiben unverändert.",
        );
      throw error;
    } finally {
      busy.delete(w.id);
    }
  });
  app.post("/api/living/worlds/:worldId/economy/actions", async (req) => {
    const catalog = await openSimsCatalog(),
      { w, town } = own(req),
      body = req.body || {};
    if (busy.has(w.id))
      throw httpErr(409, "BUSY", "Ein Zeitschritt läuft gerade");
    if (body.expectedVersion !== town.world.version)
      throw httpErr(
        409,
        "STALE",
        "Die Stadt hat sich geändert. Bitte Ansicht aktualisieren.",
      );
    const p = town.byId.get(body.simId),
      d = economicDraft(town),
      time = town.world.seconds,
      events = [];
    if (!p) throw httpErr(404, "NOT_FOUND", "Sim nicht gefunden");
    const emit = (
      type,
      person,
      t,
      facts = {},
      others = [],
      location = person.state.location_id,
    ) => {
      const e = {
        id: uid("le_"),
        world_id: w.id,
        type,
        start: t,
        end: t,
        location_id: location,
        participants: [...new Set([person.id, ...others])],
        facts,
        description: "",
        source: "user_accepted_sim_action",
        journal: [],
      };
      events.push(e);
      return e;
    };
    d.emit = emit;
    const entity = (id, kind) => {
      const x = d.entities.get(id);
      if (!x || (kind && x.kind !== kind))
        throw httpErr(
          400,
          "BAD_ENTITY",
          "Passender Eintrag aus dieser Stadt erforderlich",
        );
      return x;
    };
    let result;
    if (body.targetId && !town.byId.has(body.targetId))
      throw httpErr(
        400,
        "BAD_TARGET",
        "Zielperson gehört nicht zu dieser Stadt",
      );
    switch (body.kind) {
      case "join_households":
        result = joinHouseholds(
          d,
          p,
          town.byId.get(body.targetId),
          time,
          emit,
          {
            consentingAdultIds: Array.isArray(body.consentingAdultIds)
              ? body.consentingAdultIds
              : [],
          },
        );
        break;
      case "apply_job":
        result = applyForJob(d, p, entity(body.id, "job"), time, emit);
        break;
      case "pay_invoice": {
        const inv = entity(body.id, "invoice");
        if (
          inv.payload.simId !== p.id &&
          inv.payload.householdId !== householdOf(d, p).id
        )
          throw httpErr(403, "NOT_OWNER", "Nicht die eigene Verpflichtung");
        result = { ok: payInvoice(d, inv, time, emit) };
        break;
      }
      case "buy_item":
        result = buyItem(d, p, body.id, time, emit);
        break;
      case "leisure":
        result = planLeisure(d, p, body.id, time);
        break;
      case "membership":
        result = buyMembership(d, p, body.id, time, emit);
        break;
      case "cancel_membership": {
        const sub = entity(body.id, "subscription");
        if (sub.payload.simId !== p.id)
          throw httpErr(403, "NOT_OWNER", "Nicht die eigene Mitgliedschaft");
        sub.payload.status = "cancelled";
        touch(d, sub);
        const e = emit("membership_cancelled", p, time, {
          subscriptionId: sub.id,
          private: true,
        });
        e.description =
          p.name +
          " beendet die eigene Mitgliedschaft für zukünftige Beiträge.";
        result = { ok: true };
        break;
      }
      case "loan":
        result = issueLoan(
          d,
          p,
          {
            amountCents: body.amountCents,
            months: body.months,
            lenderId: body.lenderId,
            purpose: body.purpose,
            consent: body.consent === true,
          },
          time,
          emit,
        );
        break;
      case "move":
        if (p.age < 18)
          throw httpErr(
            400,
            "AGE_BOUNDARY",
            "Erwachsene Bezugsperson erforderlich",
          );
        result = applyForHousing(
          d,
          p,
          entity(body.id, "property"),
          time,
          emit,
          { support: body.support === true },
        );
        break;
      case "mortgage":
        result = financedPropertyPurchase(
          d,
          p,
          entity(body.id, "property"),
          time,
          emit,
          {
            consent: body.consent === true,
            downPaymentCents: body.amountCents,
            months: body.months,
          },
        );
        break;
      case "buy_property":
        result = buyProperty(d, p, entity(body.id, "property"), time, emit, {
          consent: body.consent === true,
        });
        break;
      case "task": {
        const row = DUTIES.find((r) => r.id === body.id);
        if (!row) throw httpErr(400, "BAD_TASK", "Unbekannte Aufgabe");
        result = assignObligation(d, p, row, time, emit, {
          targetId: body.targetId,
          issuerId: null,
        });
        break;
      }
      case "reschedule_task":
        result = rescheduleObligation(
          d,
          p,
          entity(body.id, "obligation"),
          time,
          emit,
        );
        break;
      case "guardian_permission": {
        const child = town.byId.get(body.targetId);
        if (
          p.age < 18 ||
          !child ||
          child.age < 15 ||
          child.age >= 18 ||
          !child.profile.family.parent_ids.includes(p.id)
        )
          throw httpErr(
            400,
            "GUARDIAN_REQUIRED",
            "Zuständige erwachsene Bezugsperson und 15–17-jähriger Sim erforderlich",
          );
        child.state.economy.guardianPermission = body.enabled === true;
        const e = emit(
          "holiday_work_permission",
          p,
          time,
          { childId: child.id, enabled: body.enabled === true, private: true },
          [child.id],
        );
        e.description =
          p.name +
          (body.enabled ? " erlaubt" : " widerruft") +
          " einen sicheren, höchstens vierstündigen Ferienjob für " +
          child.name +
          ". Schule, Altersgrenzen und Ferienzeiten bleiben bindend.";
        result = { ok: true };
        break;
      }
      case "decline_task": {
        const task = entity(body.id, "obligation");
        if (task.payload.assigneeId !== p.id)
          throw httpErr(403, "NOT_OWNER", "Nicht die eigene Aufgabe");
        task.payload.status = "declined";
        touch(d, task);
        const e = emit("obligation_declined", p, time, {
          obligationId: task.id,
          private: true,
        });
        e.description =
          p.name +
          " sagt die angenommene Aufgabe ab und braucht eine neue Absprache.";
        result = { ok: true };
        break;
      }
      case "display_item": {
        const item = entity(body.id, "item");
        if (item.payload.ownerId !== p.id || item.payload.stolen)
          throw httpErr(403, "NOT_OWNER", "Nur eigener ungestohlener Besitz");
        item.payload.publiclyDisplayed = body.enabled === true;
        touch(d, item);
        result = { ok: true };
        break;
      }
      case "lend_item":
      case "gift_item":
        result = lendItem(
          d,
          p,
          entity(body.id, "item"),
          town.byId.get(body.targetId),
          time,
          emit,
          {
            gift: body.kind === "gift_item",
            consent: body.consent === true,
            targetConsent: body.targetConsent === true,
          },
        );
        break;
      case "return_item":
        result = returnItem(d, p, entity(body.id, "item"), time, emit);
        break;
      case "adult_service_preferences": {
        if (p.age < 18)
          throw httpErr(
            400,
            "AGE_BOUNDARY",
            "Ausschließlich erwachsene Rollen",
          );
        if (body.enabled === true && body.consent !== true)
          throw httpErr(
            400,
            "CONSENT_REQUIRED",
            "Die eigene freiwillige Rollenwahl muss ausdrücklich bestätigt werden",
          );
        p.state.economy.adultService = {
          workerOptIn: body.enabled === true && body.role === "worker",
          clientOptIn: body.enabled === true && body.role === "client",
          lastAt: p.state.economy.adultService?.lastAt ?? null,
        };
        const e = emit("adult_service_preference", p, time, {
          private: true,
          adultOnly: true,
        });
        e.description =
          p.name +
          (body.enabled
            ? " entscheidet sich selbst für eine optionale private Erwachsenenrolle; jeder spätere konkrete Kontakt bleibt freiwillig und altersgeprüft."
            : " zieht sich von der optionalen privaten Erwachsenenrolle zurück.");
        result = { ok: true };
        break;
      }
      case "support":
        result = requestSupport(d, p, time, emit, {
          kind: body.supportKind || "counseling",
        });
        break;
      case "report_case":
        result = reportCase(d, p, entity(body.id, "case"), time, emit);
        break;
      case "donate":
        result = donate(d, p, body.amountCents, time, emit, {
          publicly: body.publicly === true,
        });
        break;
      case "festival":
        if (p.age < 18)
          throw httpErr(400, "AGE_BOUNDARY", "Erwachsene Planung erforderlich");
        result = civicFestival(d, time, emit, { costCents: body.amountCents });
        break;
      case "reserve": {
        if(p.age<18)throw httpErr(400,'AGE_BOUNDARY','Erwachsene Haushaltsplanung erforderlich');
        if(!Number.isSafeInteger(body.amountCents) || body.amountCents<0 || body.amountCents>1000000)throw httpErr(400,'BAD_RESERVE','Rücklagenbudget zwischen 0 und 10.000 € erforderlich');
        const h=householdOf(d,p);h.payload.budget.irregularReserve=body.amountCents;touch(d,h);
        const e=emit('reserve_plan_changed',p,time,{amountCents:body.amountCents,private:true});e.description=p.name+' plant '+(body.amountCents/100).toFixed(2)+' € monatlich für Ungeplantes ein. Das ist keine Ausgabe oder Kontobuchung.';
        result={ok:true};break;
      }
      case "expectations": {
        const x = p.state.economy.expectations;
        if (
          !Number.isSafeInteger(body.minimumNetCents) ||
          body.minimumNetCents < 0 ||
          body.minimumNetCents > 3000000 ||
          !Number.isInteger(body.maxCommuteSeconds) ||
          body.maxCommuteSeconds < 60 ||
          body.maxCommuteSeconds > 14400
        )
          throw httpErr(
            400,
            "BAD_EXPECTATIONS",
            "Realistische Einkommens- und Wegerwartung erforderlich",
          );
        x.minimumNetCents = body.minimumNetCents;
        x.maxCommuteSeconds = body.maxCommuteSeconds;
        const e = emit("job_expectations_changed", p, time, { private: true });
        e.description =
          p.name +
          " formuliert die eigenen Einkommens- und Arbeitswegerwartungen neu.";
        result = { ok: true };
        break;
      }
      default:
        throw httpErr(400, "BAD_ACTION", "Unbekannte Entscheidung");
    }
    // A refused proposal with no real event must leave the entire world untouched.
    if (!events.length && !result.ok)
      return { ...result, version: town.world.version };
    if (!events.length && result.ok) {
      const e = emit("accepted_plan", p, time, {
        kind: body.kind,
        private: true,
      });
      e.description =
        p.name +
        " nimmt einen konkreten nächsten Schritt an. Körperliche Handlungen und Zahlungen erfolgen nur bei tatsächlicher Ausführung.";
    }
    // A refused action may still have an actual application/decline to record.
    // No provisional effects are committed outside this single transaction.
    db.transaction(() => {
      if (
        db.prepare("SELECT version FROM lw_worlds WHERE world_id=?").get(w.id)
          .version !== body.expectedVersion
      )
        throw httpErr(409, "STALE", "Stadt wurde geändert");
      assertEconomicIntegrity(d);
      refreshOwnResources(d, time);
      if(['reserve','apply_job','move'].includes(body.kind))financialAppraisals(d,time,emit,{force:true,householdId:p.state.economy.householdId});
      for (const q of town.people) {
        evaluateMind(q, time, catalog);
        db.prepare(
          "UPDATE lw_sims SET profile=?,state=?,age=?,household_id=? WHERE id=?",
        ).run(j(q.profile), j(q.state), q.age, q.household_id, q.id);
      }
      for (const e of events) {
        for (const id of e.participants)
          e.journal.push({
            simId: id,
            channel: "direct",
            perception: e.description,
            interpretation:
              "Diese wirkliche Entscheidung gehört zu meinem eigenen Protokoll.",
            confidence: 1,
          });
        insertEvent(e, e.journal);
      }
      commitEconomy(d);
      db.prepare("UPDATE lw_worlds SET version=version+1 WHERE world_id=?").run(
        w.id,
      );
      db.prepare("UPDATE worlds SET updated_at=? WHERE id=?").run(now(), w.id);
    })();
    return { ...result, version: town.world.version + 1 };
  });
}
