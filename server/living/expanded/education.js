// Biographical education is explicitly procedural background. Actual completed
// qualifications require a real enrolled course, elapsed dates and attendance.
import { rng } from "../random.js";
import { JOBS, calendarDate, SKILL_LABELS } from "./catalog.js";
import { train } from "./percentile.js";
import { addFeeling } from "../cognition.js";
import { recordExperience } from "../wellbeing.js";
export const JOB_LABELS = {
  Teacher: "Lehrkraft",
  Illustrator: "Illustration",
  Designer: "Design",
  Carpenter: "Tischlerei",
  Tailor: "Schneiderei",
  Gardener: "Gartenbau",
  Baker: "Bäckerei",
  Bookseller: "Buchhandel",
  Nurse: "Pflegefachkraft",
  Firefighter: "Feuerwehr",
  Police: "Polizeidienst",
  Mayor: "Bürgermeisteramt",
  "Civic clerk": "Verwaltung",
  "Office analyst": "Büro & Analyse",
  "Fitness coach": "Fitnesstraining",
  "Retail assistant": "Verkauf",
  "Independent artist": "Freie Kunst",
  Physician: "Ärztlicher Dienst",
  Chef: "Küche",
  Mechanic: "Mechanik",
  Programmer: "Softwareentwicklung",
  "Civic planner": "Stadtplanung",
  "Kindergarten educator": "Erziehung",
  Lifeguard: "Bäderdienst",
  Bartender: "Gastronomie",
  "Club DJ": "Musik & Veranstaltung",
  Professor: "Hochschullehre",
  Researcher: "Forschung",
  Student: "Studium",
  Unemployed: "Arbeitssuchend",
  Retired: "Ruhestand",
};
const academic = new Set([
  "Teacher",
  "Physician",
  "Professor",
  "Researcher",
  "Programmer",
  "Office analyst",
  "Civic planner",
]);
const fields = {
  teaching: "Pädagogik",
  analysis: "Informatik & Analyse",
  care: "Pflege & Gesundheit",
  craft: "Gestaltung & Handwerk",
  retail: "Handel",
  administration: "Öffentliche Verwaltung",
  response: "Sicherheit & Gefahrenabwehr",
  service: "Gastronomie",
  cooking: "Lebensmittel & Küche",
  gardening: "Gartenbau",
  fitness: "Sport",
  music: "Musik",
};
export function initializeEducation(town) {
  const now = calendarDate(town.world.seconds);
  const us=JSON.parse(town.world.rules||"{}").scenario?.id==="bennington";
  const place = (purpose) =>
    [...town.places.values()].find(
      (x) => x.kind === "building" && x.purpose.includes(purpose),
    );
  for (const p of town.people) {
    if (p.profile.education?.version === 1) continue;
    const draw = rng(town.world.seed + ":education:" + p.profile.seed_key),
      history = [];
    const birth =
      p.profile.birthDate || `${now.getUTCFullYear() - p.age}-01-01`;
    const year = Number(birth.slice(0, 4)),
      role =
        p.profile.job === "Unemployed"
          ? p.state.economy?.previousJob
          : p.profile.job;
    const skill = JOBS[role]?.skill || "analysis",
      school = place("school"),
      campus = place("campus"),
      daycare = place("kindergarten");
    const stage = (
      kind,
      startAge,
      endAge,
      institution,
      subject,
      qualification = null,
      extra = {},
    ) => {
      const start = `${year + startAge}-09-01`,
        end = `${year + endAge}-07-31`,
        completed = end <= now.toISOString().slice(0, 10);
      const entry = {
        id: p.id + "_edu_" + history.length,
        kind,
        institution: institution?.name || (us?"Bennington learning center · fictional":"Bildungsstätte in Lindenstadt"),
        institutionId: institution?.id || null,
        town: p.profile.locale==="en"?"Bennington, Vermont":"Lindenstadt",
        field: subject,
        startDate: start,
        endDate: end,
        status: completed ? "completed" : "enrolled",
        qualification: completed ? qualification : null,
        plannedQualification: qualification,
        grade:
          completed && kind !== "kindergarten"
            ? Math.round((1.4 + draw() * 2.2) * 10) / 10
            : null,
        origin: "procedural_background",
        observedHours: 0,
        ...extra,
      };
      history.push(entry);
      return entry;
    };
    if (p.age >= 3)
      stage(
        "kindergarten",
        3,
        6,
        daycare,
        "Spiel, Sprache & soziales Lernen",
        "Kindergartenzeit",
      );
    if (p.age >= 6)
      stage("primary", 6, us?11:10, school, "Grundbildung", "Grundschule");
    if (p.age >= (us?11:10))
      stage(
        "secondary",
        us?11:10,
        us || p.age < 18
          ? 18
          : (academic.has(role)||JOBS[role]?.education==="university") || p.profile.job === "Student"
            ? 18
            : 16,
        school,
        "Allgemeinbildung",
        (academic.has(role)||JOBS[role]?.education==="university") || p.profile.job === "Student"
          ? "Abitur"
          : "Mittlerer Schulabschluss",
      );
    if (p.age >= 18 && ((academic.has(role)||JOBS[role]?.education==="university") || p.profile.job === "Student")) {
      const finish = role === "Physician" ? 25 : role === "Professor" ? 27 : 22;
      stage(
        "university",
        18,
        finish,
        campus,
        role === "Physician" ? "Medizin" : fields[skill],
        role === "Physician"
          ? "Medizinstudium"
          : role === "Professor"
            ? "Studium & wissenschaftliche Qualifikation"
            : "Hochschulabschluss",
        { skill },
      );
      if (p.profile.job === "Student" && p.age >= 22)
        stage(
          "university",
          Math.max(22, p.age - 1),
          Math.max(24, p.age + 1),
          campus,
          fields[skill] || "Weiterführendes Fachstudium",
          "Weiterführender Hochschulabschluss",
          { skill },
        );
    } else if (p.age >= 18 && p.profile.job !== "Student") {
      stage(
        "vocational",
        us?18:16,
        us?21:19,
        { name: us?"Green Valley Technical Training · fictional":"Berufskolleg & Ausbildungsbetrieb Lindenstadt" },
        fields[skill] || "Berufliche Grundlagen",
        "Berufsausbildung",
        { skill },
      );
    }
    // Current authored employment wins over a guessed enrollment; do not
    // pretend an impossible university degree was earned in a single year.
    const current =
      p.age < 18 || p.profile.job === "Student"
        ? history.findLast((x) => x.status === "enrolled")
        : null;
    for (const entry of history)
      if (entry.status === "enrolled" && entry !== current) {
        entry.status = "unverified";
        entry.grade = null;
        entry.qualification = null;
      }
    if(us){
      const translated={"Spiel, Sprache & soziales Lernen":"Play, language and social learning","Kindergartenzeit":"Early learning","Grundbildung":"Elementary education","Grundschule":"Elementary school","Allgemeinbildung":"General education","Abitur":"High school diploma","Mittlerer Schulabschluss":"High school diploma","Medizin":"Medicine","Medizinstudium":"Medical degree","Studium & wissenschaftliche Qualifikation":"Degree and research qualification","Hochschulabschluss":"College degree","Weiterführendes Fachstudium":"Graduate study","Weiterführender Hochschulabschluss":"Graduate degree","Berufliche Grundlagen":"Vocational foundations","Berufsausbildung":"Vocational qualification","Pädagogik":"Education","Informatik & Analyse":"Computing and analysis","Pflege & Gesundheit":"Health and care","Gestaltung & Handwerk":"Design and skilled trades","Handel":"Retail","Öffentliche Verwaltung":"Public administration","Sicherheit & Gefahrenabwehr":"Public safety","Gastronomie":"Hospitality","Lebensmittel & Küche":"Culinary arts","Gartenbau":"Horticulture","Sport":"Sports","Musik":"Music"};
      for(const entry of history){for(const key of ['field','qualification','plannedQualification'])if(entry[key])entry[key]=translated[entry[key]]||entry[key];if(entry.grade!=null)entry.grade=Math.round((5-entry.grade)*10)/10;entry.gradeScale='GPA 0–4 (game approximation)';}
    }
    p.profile.education = {
      version: 1,
      history,
      currentId: current?.id || null,
      origin: "procedural_biographical_supplement",
      credentialsNote: us?"Qualifications are fictional background records, not verification of attendance at a real institution. Observed study and new credentials require actual learning and time.":
        "Vorhandene Berufsnachweise werden separat geführt; eine ergänzte Biografie erteilt keine neue Zulassung.",
    };
    p.state.education = { studyHours: 0, attendanceDays: [], lastDay: null };
  }
}
export function currentEducation(p) {
  return (
    p.profile.education?.history?.find(
      (e) => e.id === p.profile.education.currentId && e.status === "enrolled",
    ) || null
  );
}
export function activityStatus(p, town = null) {
  const care = p.state.careSupport,
    study = currentEducation(p);
  let kind,
    label,
    placeId = p.profile.workplace_id;
  if (care?.mode === "residential") {
    kind = "residential_care";
    label = "Ruhestand · Pflegeheim";
    placeId = care.buildingId;
  } else if (care) {
    kind = "home_care";
    label = "Ruhestand · häusliche Pflege";
    placeId = town?.places.get(p.profile.home.living)?.parent_id;
  } else if (p.age < 3) {
    kind = "early_care";
    label = "Kleinkindbetreuung";
    placeId = town?.places.get(p.profile.home.living)?.parent_id;
  } else if (p.age < 6) {
    kind = "kindergarten";
    label = "Kindergarten";
    placeId = study?.institutionId || placeId;
  } else if (p.age < 18) {
    kind = "school";
    label = study?.kind === "vocational" ? "Ausbildung" : "Schule";
    placeId = study?.institutionId || placeId;
  } else if (p.state.economy?.parentalCare) {
    kind = "parental_care";
    label = "Betreuungspause · kleines Kind";
  } else if (study) {
    kind = "study";
    label = study.kind === "university" ? "Studium" : "Ausbildung";
    placeId = study.institutionId || placeId;
  } else if (p.profile.job === "Retired" || p.age >= 66) {
    kind = "retired";
    label = "Ruhestand";
    placeId = null;
  } else if (p.profile.job === "Unemployed" || !p.state.economy?.employmentId) {
    kind = "unemployed";
    label = "Arbeitssuchend";
    placeId = null;
  } else {
    kind = "employed";
    label = JOB_LABELS[p.profile.job] || p.profile.job;
  }
  if(p.profile.locale==='en')label=({residential_care:'Retirement · residential care',home_care:'Retirement · care at home',early_care:'Early childhood care',kindergarten:'Early learning',school:'School',parental_care:'Parental caregiving leave',study:'College or vocational study',retired:'Retired',unemployed:'Looking for work',employed:p.profile.job})[kind]||label;
  return {
    kind,
    label,
    placeId: placeId || null,
    placeName: town?.places.get(placeId)?.name || study?.institution || null,
    caregiving: p.state.economy?.elderCareTargets?.length || 0,
  };
}
export function educationView(p, town) {
  const current = currentEducation(p),
    status = activityStatus(p, town);
  return {
    status,
    current,
    history: p.profile.education?.history || [],
    credentials: p.state.credentials || [],
    note: p.profile.education?.credentialsNote,
    ambitions: (p.state.psychology?.ambitions || []).filter((g) =>
      ["career", "learning", "mastery", "create", "stability"].includes(g.kind),
    ),
    studyHours: p.state.education?.studyHours || 0,
    careerHours: p.state.economy?.paidWorkSeconds / 3600 || 0,
    employmentHistory: [],
  };
}
export function completeStudy(p, event, duration) {
  const course = currentEducation(p);
  if (!course) return false;
  const e = p.state.education;
  e.studyHours += duration / 3600;
  course.observedHours = (course.observedHours || 0) + duration / 3600;
  const day = Math.floor(event.end / 86400);
  e.attendanceDays = [...new Set((e.attendanceDays || []).concat(day))].slice(
    -400,
  );
  train(p, course.skill || "analysis", duration, event, event.end);
  event.facts.education = { courseId: course.id, actualHours: duration / 3600 };
  recordExperience(
    p,
    event,
    event.end,
    "education",
    { E: 0.005, A: 0.006, M: 0.003 },
    "Tatsächlich gelernt: ein eigener Bildungsschritt, keine automatisch verliehene Qualifikation.",
  );
  return true;
}
export function educationDaily(d, time, emit) {
  const date = calendarDate(time).toISOString().slice(0, 10);
  for (const p of d.people.values()) {
    const c = currentEducation(p);
    if (!c || c.endDate > date || c.lastReviewDate === date) continue;
    c.lastReviewDate = date;
    // Starting background is not attendance. Academic/vocational completion
    // requires time, 200 observed hours and repeated actual attendance.
    if (
      ["university", "vocational"].includes(c.kind) &&
      ((c.observedHours || 0) < 200 ||
        (p.state.education.attendanceDays || []).length < 60)
    ) {
      c.completionPending = true;
      continue;
    }
    if (
      !["university", "vocational"].includes(c.kind) &&
      (c.observedHours || 0) < 50
    ) {
      c.completionPending = true;
      continue;
    }
    const ev = emit("education_completed", p, time, {
      courseId: c.id,
      private: true,
    });
    c.status = "completed";
    c.qualification = c.plannedQualification;
    c.actualCompletedAt = time;
    c.sourceEventId = ev.id;
    c.grade =
      c.kind === "kindergarten"
        ? null
        : Math.round(
            (4 -
              Math.min(1, p.state.skills[c.skill || "analysis"] || 0.3) * 2.8) *
              10,
          ) / 10;
    if(p.profile.locale==="en"&&c.grade!=null){c.grade=Math.round((5-c.grade)*10)/10;c.gradeScale="GPA 0–4 (game approximation)";}
    ev.description = `${p.name} schließt nach tatsächlich dokumentiertem Lernen ${c.field} an ${c.institution} ab. ${c.grade == null ? "Ohne Schulnote." : "Ergebnis: " + c.grade + "."}`;
    if(c.kind==="secondary"&&p.age>=18&&!d.contracts.has(p.id)){p.profile.job="Unemployed";p.profile.workplace_id=null;}
    if (["university", "vocational"].includes(c.kind)) {
      p.state.credentials.push("degree:" + c.field);
      if(c.skill&&!p.state.credentials.includes("degree_skill:"+c.skill))p.state.credentials.push("degree_skill:"+c.skill);
      if (p.profile.job === "Student") {
        p.profile.job = "Unemployed";
        p.profile.workplace_id = null;
      }
    }
    if(p.profile.locale==="en")ev.description=`${p.name} completes ${c.field} at ${c.institution} after recorded learning. ${c.grade==null?"No grade assigned.":"Result: "+c.grade+" (GPA approximation)."}`;
    p.profile.education.currentId = null;
    // A real completed school stage opens the next dated enrollment; it does
    // not retroactively award years of attendance or a professional license.
    const nextKind =
      c.kind === "kindergarten"
        ? "primary"
        : c.kind === "primary"
          ? "secondary"
          : null;
    if (nextKind) {
      const institution = [...d.town.places.values()].find(
        (x) => x.kind === "building" && x.purpose.includes("school"),
      );
      const startYear = calendarDate(time).getUTCFullYear();
      const next = {
        id: p.id + "_edu_observed_" + time,
        kind: nextKind,
        institution: institution?.name || c.institution,
        institutionId: institution?.id || null,
        town: p.profile.locale==="en"?"Bennington, Vermont":"Lindenstadt",
        field: p.profile.locale==="en"?(nextKind==="primary"?"Elementary education":"General education"):(nextKind === "primary" ? "Grundbildung" : "Allgemeinbildung"),
        startDate: startYear + "-09-01",
        endDate: startYear + (nextKind === "primary" ? 4 : 8) + "-07-31",
        status: "enrolled",
        qualification: null,
        plannedQualification:
          nextKind === "primary" ? "Grundschule" : "Mittlerer Schulabschluss",
        grade: null,
        origin: "actual_enrollment",
        observedHours: 0,
        sourceEventId: ev.id,
      };
      p.profile.education.history.push(next);
      p.profile.education.currentId = next.id;
      p.state.education.attendanceDays = [];
      if (institution) {
        p.profile.workplace_id =
          [...d.town.places.values()].find(
            (x) => x.parent_id === institution.id && x.kind === "room",
          )?.id || p.profile.workplace_id;
      }
    }
    addFeeling(p, "pride", 0.4, time, {
      kind: "education_completed",
      evidence_id: ev.id,
      text: ev.description,
    });
    recordExperience(
      p,
      ev,
      time,
      "education_completion",
      { E: 0.015, A: 0.025, M: 0.01 },
      "Ein durch Anwesenheit und Zeit belegter Abschluss.",
    );
  }
}
